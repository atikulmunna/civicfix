/**
 * Object storage for uploaded images.
 *
 * - LocalStore: files under LOCAL_UPLOAD_DIR, served by the API at /uploads
 *   (development and tests). Not durable on Fly: the disk is replaced on
 *   every deploy.
 * - S3Store: an S3-compatible bucket (production: Neon Object Storage, a
 *   public_read bucket). Objects are written with immutable cache headers
 *   because every key is a fresh random UUID, so CDNs can cache them forever.
 *
 * Report rows store `/uploads/<key>` regardless of provider, so stored data
 * never depends on where the bytes live.
 */
import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { DeleteObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { env, type Env } from '../config/env.js';

export interface ObjectStore {
  /** Store an object under a server-generated key. */
  put(key: string, body: Buffer, contentType: string): Promise<void>;
  /** Remove objects; keys that do not exist are ignored. */
  delete(keys: readonly string[]): Promise<void>;
  /** URL a browser can load the object from. */
  publicUrl(key: string): string;
}

/** Keys are random UUID file names: no slashes, no traversal. */
export const STORAGE_KEY_PATTERN = /^[0-9a-f-]{36}\.[a-z0-9]{2,5}$/;

function assertSafeKey(key: string): void {
  if (!STORAGE_KEY_PATTERN.test(key)) throw new Error(`Unsafe storage key: ${key}`);
}

const IMMUTABLE = 'public, max-age=31536000, immutable';

export class LocalStore implements ObjectStore {
  constructor(readonly dir: string) {}

  async put(key: string, body: Buffer): Promise<void> {
    assertSafeKey(key);
    await mkdir(this.dir, { recursive: true });
    await writeFile(path.join(this.dir, key), body);
  }

  async delete(keys: readonly string[]): Promise<void> {
    keys.forEach(assertSafeKey);
    await Promise.all(keys.map((key) => rm(path.join(this.dir, key), { force: true })));
  }

  publicUrl(key: string): string {
    return `/uploads/${key}`;
  }
}

/** The one S3Client method the store uses (lets tests pass a fake). */
export type S3Sender = Pick<S3Client, 'send'>;

export class S3Store implements ObjectStore {
  constructor(
    private readonly client: S3Sender,
    private readonly bucket: string,
    private readonly endpoint: string,
  ) {}

  async put(key: string, body: Buffer, contentType: string): Promise<void> {
    assertSafeKey(key);
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
        CacheControl: IMMUTABLE,
      }),
    );
  }

  async delete(keys: readonly string[]): Promise<void> {
    keys.forEach(assertSafeKey);
    // Single-object deletes (a report has at most 5 images); widely supported
    // by S3-compatible services, unlike batch DeleteObjects.
    await Promise.all(
      keys.map((key) =>
        this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key })),
      ),
    );
  }

  /** Public URL of an object in a public-read bucket (path-style addressing). */
  publicUrl(key: string): string {
    return `${this.endpoint.replace(/\/+$/, '')}/${this.bucket}/${encodeURIComponent(key)}`;
  }
}

export function createObjectStore(cfg: Env = env): ObjectStore {
  if (cfg.UPLOAD_PROVIDER === 'local') {
    return new LocalStore(path.resolve(process.cwd(), cfg.LOCAL_UPLOAD_DIR));
  }
  const {
    S3_BUCKET: bucket,
    AWS_ENDPOINT_URL_S3: endpoint,
    AWS_REGION: region,
    AWS_ACCESS_KEY_ID: accessKeyId,
    AWS_SECRET_ACCESS_KEY: secretAccessKey,
  } = cfg;
  // config/env.ts already rejects a partial S3 config at startup; this narrows the types.
  if (!bucket || !endpoint || !region || !accessKeyId || !secretAccessKey) {
    throw new Error('UPLOAD_PROVIDER=s3 requires S3_BUCKET and the AWS_* bucket settings.');
  }
  const client = new S3Client({
    endpoint,
    region,
    credentials: { accessKeyId, secretAccessKey },
    forcePathStyle: true, // required by Neon Object Storage
  });
  return new S3Store(client, bucket, endpoint);
}

export const objectStore = createObjectStore();
