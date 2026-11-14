import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  MAX_EDGE,
  fitWithin,
  megabytes,
  prepareImages,
  resizeImage,
  totalBytes,
} from './resize-image';

const photo = (bytes: number, name = 'IMG_0001.JPG') =>
  new File([new Uint8Array(bytes)], name, { type: 'image/jpeg', lastModified: 42 });

/**
 * Fakes the browser image pipeline jsdom lacks: a decoded bitmap of the given
 * size, a 2D context, and toBlob producing `encoded` bytes in the requested
 * type (or PNG for types listed in `unsupported`, as browsers do).
 */
function fakeBrowser(
  bitmapSize: { width: number; height: number },
  options: { encoded?: number; unsupported?: string[] } = {},
) {
  const bitmap = { ...bitmapSize, close: vi.fn() };
  vi.stubGlobal(
    'createImageBitmap',
    vi.fn(() => Promise.resolve(bitmap)),
  );
  const context = { fillStyle: '', fillRect: vi.fn(), drawImage: vi.fn() };
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
    context as unknown as CanvasRenderingContext2D,
  );
  const requested: string[] = [];
  vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((callback, type) => {
    const asked = type ?? 'image/png';
    requested.push(asked);
    const actual = options.unsupported?.includes(asked) ? 'image/png' : asked;
    callback(new Blob([new Uint8Array(options.encoded ?? 1000)], { type: actual }));
  });
  return { bitmap, context, requested };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('fitWithin', () => {
  it('keeps images that already fit', () => {
    expect(fitWithin(1200, 800)).toEqual({ width: 1200, height: 800 });
    expect(fitWithin(MAX_EDGE, MAX_EDGE)).toEqual({ width: MAX_EDGE, height: MAX_EDGE });
  });

  it('scales the longest edge down to the limit, keeping the aspect ratio', () => {
    expect(fitWithin(4000, 3000)).toEqual({ width: 1600, height: 1200 });
    expect(fitWithin(3024, 4032)).toEqual({ width: 1200, height: 1600 });
  });

  it('never produces a zero-sized edge', () => {
    expect(fitWithin(100_000, 10, 1600)).toEqual({ width: 1600, height: 1 });
  });
});

describe('resizeImage', () => {
  it('returns the original where the browser cannot decode images', async () => {
    const file = photo(10);
    expect(await resizeImage(file)).toBe(file);
  });

  it('returns the original when decoding fails', async () => {
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn(() => Promise.reject(new Error('unsupported'))),
    );
    const file = photo(10);
    expect(await resizeImage(file)).toBe(file);
  });

  it('draws the photo at the reduced size and re-encodes it as WebP', async () => {
    const { bitmap, context, requested } = fakeBrowser(
      { width: 4000, height: 3000 },
      { encoded: 300_000 },
    );
    const file = photo(5_000_000);

    const resized = await resizeImage(file);

    expect(context.drawImage).toHaveBeenCalledWith(bitmap, 0, 0, 1600, 1200);
    expect(requested).toEqual(['image/webp']);
    expect(resized).not.toBe(file);
    expect(resized.type).toBe('image/webp');
    expect(resized.name).toBe('IMG_0001.webp');
    expect(resized.size).toBe(300_000);
    expect(bitmap.close).toHaveBeenCalled();
  });

  it('falls back to JPEG where the browser cannot encode WebP', async () => {
    const { requested } = fakeBrowser(
      { width: 4000, height: 3000 },
      { unsupported: ['image/webp'] },
    );
    const resized = await resizeImage(photo(5_000_000, 'scan.png'));
    expect(requested).toEqual(['image/webp', 'image/jpeg']);
    expect(resized.type).toBe('image/jpeg');
    expect(resized.name).toBe('scan.jpg');
  });

  it('returns the original instead of failing when drawing throws', async () => {
    const { bitmap, context } = fakeBrowser({ width: 4000, height: 3000 });
    context.drawImage.mockImplementation(() => {
      throw new Error('out of memory');
    });
    const file = photo(5_000_000);
    expect(await resizeImage(file)).toBe(file);
    expect(bitmap.close).toHaveBeenCalled();
  });

  it('keeps the original when re-encoding would not make it smaller', async () => {
    fakeBrowser({ width: 800, height: 600 }, { encoded: 50_000 });
    const file = photo(40_000);
    expect(await resizeImage(file)).toBe(file);
  });
});

describe('upload helpers', () => {
  it('prepares every photo in order', async () => {
    fakeBrowser({ width: 4000, height: 3000 }, { encoded: 1000 });
    const prepared = await prepareImages([photo(5_000_000, 'a.jpg'), photo(4_000_000, 'b.jpg')]);
    expect(prepared.map((f) => f.name)).toEqual(['a.webp', 'b.webp']);
    expect(totalBytes(prepared)).toBe(2000);
  });

  it('counts sizes in megabytes to one decimal', () => {
    expect(megabytes(3.5 * 1024 * 1024)).toBe(3.5);
    expect(megabytes(4 * 1024 * 1024)).toBe(4);
    expect(megabytes(1.26 * 1024 * 1024)).toBe(1.3);
  });
});
