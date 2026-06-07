/**
 * Image upload handling (REP-003, SEC-008/009/012).
 *
 * - Multer parses multipart into memory (size-capped, SEC-009).
 * - Each buffer's true type is verified by magic-byte sniffing, NOT the
 *   client-declared content-type (SEC-008).
 * - Files are written under LOCAL_UPLOAD_DIR with server-generated random
 *   keys, never the client filename (SEC-012). The dir is outside the source
 *   tree's served code and the files are never executed.
 */
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import multer from 'multer';
import { fileTypeFromBuffer } from 'file-type';
import { env } from '../config/env.js';
import { ApiError } from './errors.js';

// Allowlisted image types → canonical extension.
const ALLOWED: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

export const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: env.MAX_UPLOAD_BYTES, files: 5 },
});

export interface StoredImage {
  imageUrl: string;
  storageKey: string;
  mime: string;
}

/** Absolute path to the upload directory (resolved once). */
export const uploadDir = path.resolve(process.cwd(), env.LOCAL_UPLOAD_DIR);

/**
 * Verify a single uploaded buffer by magic bytes and persist it. Throws
 * VALIDATION_ERROR (mapped from UPLOAD context) if the bytes are not an
 * allowlisted image type.
 */
export async function storeImage(file: Express.Multer.File): Promise<StoredImage> {
  const sniffed = await fileTypeFromBuffer(file.buffer);
  const ext = sniffed && ALLOWED[sniffed.mime];
  if (!sniffed || !ext) {
    throw new ApiError('VALIDATION_ERROR', 'Only JPEG, PNG, or WebP images are allowed.');
  }

  const storageKey = `${randomUUID()}.${ext}`;
  await mkdir(uploadDir, { recursive: true });
  await writeFile(path.join(uploadDir, storageKey), file.buffer);

  return { imageUrl: `/uploads/${storageKey}`, storageKey, mime: sniffed.mime };
}

/** Persist all uploaded images, returning their stored metadata in order. */
export function storeImages(files: Express.Multer.File[]): Promise<StoredImage[]> {
  return Promise.all(files.map(storeImage));
}
