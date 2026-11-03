/**
 * Shrinks report photos in the browser before they are uploaded (R18).
 *
 * Uploads go through the web origin (Vercel rewrites /api to the API), and
 * Vercel caps a proxied request body at about 4.5 MB, so a single phone photo
 * can already be too large. The API normalizes every image anyway (longest
 * edge 1600 px, re-encoded as WebP), so doing the same here loses nothing,
 * keeps a five photo report far below the cap, and strips EXIF data
 * (including GPS) before the file leaves the device. The server still checks
 * and re-encodes whatever it receives.
 */

/** Longest edge after resizing; matches the server (backend/src/lib/uploads.ts). */
export const MAX_EDGE = 1600;

/** Photos per report; matches the server's upload limit. */
export const MAX_PHOTOS = 5;

/**
 * Total photo bytes one report may send. Vercel rejects proxied bodies over
 * 4.5 MB and failures were measured from about 4 MB (2026-11-02), so this
 * leaves room for the form fields and multipart framing.
 */
export const UPLOAD_BUDGET_BYTES = 3.5 * 1024 * 1024;

const QUALITY = 0.85;

/** Output formats in order of preference, with the file extension to use. */
const FORMATS = [
  ['image/webp', 'webp'],
  ['image/jpeg', 'jpg'],
] as const;

export interface Size {
  width: number;
  height: number;
}

/** Scales `width` x `height` down (never up) so the longest edge is at most `maxEdge`. */
export function fitWithin(width: number, height: number, maxEdge = MAX_EDGE): Size {
  const longest = Math.max(width, height);
  if (longest <= maxEdge) return { width, height };
  const scale = maxEdge / longest;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

function encode(canvas: HTMLCanvasElement, type: string): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob(resolve, type, QUALITY);
  });
}

/**
 * Returns `file` scaled to fit `maxEdge` and re-encoded as WebP (or JPEG where
 * the browser cannot encode WebP). Returns the original file when the browser
 * cannot decode or draw it, or when re-encoding would not make it smaller.
 * Never rejects.
 */
export async function resizeImage(file: File, maxEdge = MAX_EDGE): Promise<File> {
  if (typeof createImageBitmap !== 'function') return file;
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    return file;
  }

  const canvas = document.createElement('canvas');
  try {
    const size = fitWithin(bitmap.width, bitmap.height, maxEdge);
    canvas.width = size.width;
    canvas.height = size.height;
    const context = canvas.getContext('2d');
    if (!context) return file;
    // Photos have no transparency; a white base keeps a JPEG fallback from
    // turning transparent pixels black.
    context.fillStyle = '#fff';
    context.fillRect(0, 0, size.width, size.height);
    context.drawImage(bitmap, 0, 0, size.width, size.height);

    for (const [type, extension] of FORMATS) {
      const blob = await encode(canvas, type);
      // A browser that cannot encode `type` returns a PNG instead: try the next format.
      if (blob?.type !== type) continue;
      if (blob.size >= file.size) return file;
      const base = file.name.replace(/\.[^.]*$/, '') || 'photo';
      return new File([blob], `${base}.${extension}`, {
        type,
        lastModified: file.lastModified,
      });
    }
    return file;
  } catch {
    // Resizing is an optimization: never let it block a submission (for
    // example when a phone runs out of memory drawing a huge photo).
    return file;
  } finally {
    bitmap.close();
    // Release the pixel buffer now instead of waiting for garbage collection.
    canvas.width = 0;
    canvas.height = 0;
  }
}

/**
 * Resizes photos one at a time: a decoded 12 MP photo takes about 48 MB of
 * memory, so decoding five at once can exhaust a phone's tab.
 */
export async function prepareImages(files: readonly File[]): Promise<File[]> {
  const prepared: File[] = [];
  for (const file of files) prepared.push(await resizeImage(file));
  return prepared;
}

export function totalBytes(files: readonly File[]): number {
  return files.reduce((sum, file) => sum + file.size, 0);
}

/** "3.5 MB" style label for upload messages. */
export function formatMegabytes(bytes: number): string {
  return `${String(Math.round((bytes / (1024 * 1024)) * 10) / 10)} MB`;
}
