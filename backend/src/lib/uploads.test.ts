import { crc32 } from 'node:zlib';
import { afterEach, describe, expect, it, vi } from 'vitest';
import sharp from 'sharp';

// Spy on disk writes so storeImages can be checked without touching uploads/.
const { writeFile } = vi.hoisted(() => ({ writeFile: vi.fn(() => Promise.resolve()) }));
vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>();
  return { ...actual, writeFile, mkdir: vi.fn(() => Promise.resolve(undefined)) };
});

const { MAX_IMAGE_EDGE, normalizeImage, storeImages } = await import('./uploads.js');

/** A phone-like JPEG: rotated 90° via EXIF, with device and GPS metadata. */
async function phonePhoto(): Promise<Buffer> {
  return sharp({ create: { width: 64, height: 48, channels: 3, background: 'red' } })
    .jpeg()
    .withMetadata({ orientation: 6 })
    .withExifMerge({
      IFD0: { Make: 'TestPhone' },
      IFD3: {
        GPSLatitudeRef: 'N',
        GPSLatitude: '23/1 48/1 37/1',
        GPSLongitudeRef: 'E',
        GPSLongitude: '90/1 24/1 45/1',
      },
    })
    .toBuffer();
}

/** A tiny PNG whose header claims width x height (a decompression-bomb shape). */
async function pngClaiming(width: number, height: number): Promise<Buffer> {
  const png = Buffer.from(
    await sharp({ create: { width: 1, height: 1, channels: 3, background: 'blue' } })
      .png()
      .toBuffer(),
  );
  // IHDR data starts at byte 16 (8-byte signature + 4 length + 4 type).
  png.writeUInt32BE(width, 16);
  png.writeUInt32BE(height, 20);
  png.writeUInt32BE(crc32(png.subarray(12, 29)), 29); // CRC over type + 13 data bytes
  return png;
}

const asUpload = (buffer: Buffer) => ({ buffer }) as Express.Multer.File;

afterEach(() => {
  writeFile.mockClear();
});

describe('normalizeImage', () => {
  it('strips all metadata, including GPS and device, and outputs WebP', async () => {
    const input = await phonePhoto();
    expect((await sharp(input).metadata()).exif).toBeDefined();
    expect(input.includes('TestPhone')).toBe(true);

    const out = await normalizeImage(input);
    const meta = await sharp(out.buffer).metadata();
    expect(meta.format).toBe('webp');
    expect(out.mime).toBe('image/webp');
    expect(meta.exif).toBeUndefined();
    expect(out.buffer.includes('TestPhone')).toBe(false);
  });

  it('applies the EXIF orientation before stripping it', async () => {
    const out = await normalizeImage(await phonePhoto());
    expect({ width: out.width, height: out.height }).toEqual({ width: 48, height: 64 });
  });

  it('caps the longest edge without changing the aspect ratio', async () => {
    const wide = await sharp({
      create: { width: 3200, height: 1000, channels: 3, background: 'green' },
    })
      .png()
      .toBuffer();
    const out = await normalizeImage(wide);
    expect(out.width).toBe(MAX_IMAGE_EDGE);
    expect(out.height).toBe(500);
  });

  it('rejects non-images by magic bytes', async () => {
    await expect(normalizeImage(Buffer.from('<?php echo 1; ?>'))).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
      message: 'Only JPEG, PNG, or WebP images are allowed.',
    });
  });

  it('rejects images whose dimensions exceed the pixel limit (decompression bombs)', async () => {
    await expect(normalizeImage(await pngClaiming(10_000, 10_000))).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
      message: expect.stringContaining('too large') as unknown,
    });
  });
});

describe('storeImages', () => {
  it('writes nothing when any file in the batch is invalid', async () => {
    const files = [asUpload(await phonePhoto()), asUpload(Buffer.from('not an image'))];
    await expect(storeImages(files)).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(writeFile).not.toHaveBeenCalled();
  });

  it('writes one WebP per valid file, in order', async () => {
    const stored = await storeImages([asUpload(await phonePhoto()), asUpload(await phonePhoto())]);
    expect(stored).toHaveLength(2);
    expect(stored.every((s) => s.imageUrl.endsWith('.webp') && s.mime === 'image/webp')).toBe(true);
    expect(writeFile).toHaveBeenCalledTimes(2);
  });
});
