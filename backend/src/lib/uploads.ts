/**
 * Image upload handling (REP-003, SEC-008/009/012).
 *
 * - Multer parses multipart into memory (size-capped, SEC-009).
 * - Each buffer's true type is verified by magic-byte sniffing, NOT the
 *   client-declared content-type (SEC-008).
 * - Every image is then re-encoded with sharp: rotated upright from its EXIF
 *   orientation, capped to MAX_IMAGE_EDGE, and written as WebP with ALL
 *   metadata stripped. Phone photos carry EXIF GPS coordinates and device
 *   details; publishing them as-is could reveal where a reporter lives.
 * - Files are stored through the configured ObjectStore (lib/storage.ts:
 *   local disk or an S3-compatible bucket) under server-generated random
 *   keys, never the client filename (SEC-012), and are never executed.
 */
import { randomUUID } from 'node:crypto';
import multer from 'multer';
import { fileTypeFromBuffer } from 'file-type';
import sharp from 'sharp';
import { env } from '../config/env.js';
import { ApiError } from './errors.js';
import { logger } from './logger.js';
import { objectStore } from './storage.js';

/** Accepted input types (verified by magic bytes). Output is always WebP. */
const ALLOWED_INPUT = new Set(['image/jpeg', 'image/png', 'image/webp']);

/** Longest edge of a stored image: plenty for report detail views. */
export const MAX_IMAGE_EDGE = 1600;
/**
 * Decoded-pixel ceiling. A small compressed file can expand into a huge bitmap
 * (decompression bomb); this keeps one decode well inside the 512 MB API
 * machine. 40 MP covers phone cameras' default capture modes.
 */
export const MAX_INPUT_PIXELS = 40_000_000;
const WEBP_QUALITY = 80;

// A long-running API: don't keep decoded images in libvips' cache, and use one
// thread per operation on the single shared vCPU.
sharp.cache(false);
sharp.concurrency(1);

export const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: env.MAX_UPLOAD_BYTES, files: 5 },
});

export interface StoredImage {
  imageUrl: string;
  storageKey: string;
  mime: string;
}

export interface NormalizedImage {
  buffer: Buffer;
  mime: 'image/webp';
  ext: 'webp';
  width: number;
  height: number;
}

/**
 * Verify an upload by magic bytes, then re-encode it upright, size-capped and
 * metadata-free as WebP. Throws VALIDATION_ERROR for anything that is not a
 * decodable JPEG, PNG or WebP within the pixel limit.
 */
export async function normalizeImage(input: Buffer): Promise<NormalizedImage> {
  const sniffed = await fileTypeFromBuffer(input);
  if (!sniffed || !ALLOWED_INPUT.has(sniffed.mime)) {
    throw new ApiError('VALIDATION_ERROR', 'Only JPEG, PNG, or WebP images are allowed.');
  }
  try {
    const { data, info } = await sharp(input, { limitInputPixels: MAX_INPUT_PIXELS })
      .rotate() // apply EXIF orientation before the metadata is dropped
      .resize({
        width: MAX_IMAGE_EDGE,
        height: MAX_IMAGE_EDGE,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .webp({ quality: WEBP_QUALITY })
      .toBuffer({ resolveWithObject: true });
    return {
      buffer: data,
      mime: 'image/webp',
      ext: 'webp',
      width: info.width,
      height: info.height,
    };
  } catch (err) {
    const tooLarge = err instanceof Error && err.message.includes('pixel limit');
    throw new ApiError(
      'VALIDATION_ERROR',
      tooLarge
        ? `Image dimensions are too large (max ${String(MAX_INPUT_PIXELS / 1_000_000)} megapixels).`
        : 'The image could not be read. Please upload a valid photo.',
    );
  }
}

async function writeImage(image: NormalizedImage): Promise<StoredImage> {
  const storageKey = `${randomUUID()}.${image.ext}`;
  await objectStore.put(storageKey, image.buffer, image.mime);
  // Stored as a provider-neutral path; see lib/storage.ts.
  return { imageUrl: `/uploads/${storageKey}`, storageKey, mime: image.mime };
}

/**
 * Best-effort removal of stored images, e.g. after a failed report create or a
 * report delete. A failure is logged, never thrown: the caller's outcome (the
 * original error, or a successful delete) matters more than an orphaned file.
 */
export async function deleteStoredImages(keys: readonly string[]): Promise<void> {
  if (keys.length === 0) return;
  try {
    await objectStore.delete(keys);
  } catch (err) {
    logger.error({ err, keys }, 'failed to delete stored images');
  }
}

/** Verify, normalize and persist one upload. */
export async function storeImage(file: Express.Multer.File): Promise<StoredImage> {
  return writeImage(await normalizeImage(file.buffer));
}

/**
 * Persist all uploaded images in order. Every file is validated and
 * normalized before anything is written, so a bad file never leaves earlier
 * ones orphaned on disk. Sequential on purpose: decoding several large photos
 * at once could exhaust the API machine's memory.
 */
export async function storeImages(files: Express.Multer.File[]): Promise<StoredImage[]> {
  const normalized: NormalizedImage[] = [];
  for (const file of files) normalized.push(await normalizeImage(file.buffer));
  const stored: StoredImage[] = [];
  try {
    for (const image of normalized) stored.push(await writeImage(image));
  } catch (err) {
    // A storage failure part-way through: remove what was already written.
    await deleteStoredImages(stored.map((s) => s.storageKey));
    throw err;
  }
  return stored;
}
