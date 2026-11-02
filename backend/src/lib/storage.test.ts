import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { DeleteObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { LocalStore, S3Store, type S3Sender } from './storage.js';

const key = () => `${randomUUID()}.webp`;

function fakeClient() {
  const send = vi.fn<(command: unknown) => Promise<object>>(() => Promise.resolve({}));
  return { client: { send } as unknown as S3Sender, send };
}

describe('S3Store', () => {
  it('puts objects with content type and an immutable cache header', async () => {
    const { client, send } = fakeClient();
    const store = new S3Store(client, 'report-images', 'https://s3.example.test');
    const k = key();

    await store.put(k, Buffer.from('img'), 'image/webp');

    const command = send.mock.calls[0]?.[0] as PutObjectCommand;
    expect(command).toBeInstanceOf(PutObjectCommand);
    expect(command.input).toMatchObject({
      Bucket: 'report-images',
      Key: k,
      ContentType: 'image/webp',
      CacheControl: 'public, max-age=31536000, immutable',
    });
  });

  it('deletes each key, and does nothing for an empty list', async () => {
    const { client, send } = fakeClient();
    const store = new S3Store(client, 'report-images', 'https://s3.example.test');
    const keys = [key(), key()];

    await store.delete([]);
    expect(send).not.toHaveBeenCalled();

    await store.delete(keys);
    const commands = send.mock.calls.map((c) => c[0] as DeleteObjectCommand);
    expect(commands.every((c) => c instanceof DeleteObjectCommand)).toBe(true);
    expect(commands.map((c) => c.input.Key)).toEqual(keys);
  });

  it('builds path-style public URLs', () => {
    const { client } = fakeClient();
    const k = key();
    const store = new S3Store(client, 'report-images', 'https://s3.example.test/');
    expect(store.publicUrl(k)).toBe(`https://s3.example.test/report-images/${k}`);
  });

  it('rejects keys that are not server-generated file names', async () => {
    const { client, send } = fakeClient();
    const store = new S3Store(client, 'report-images', 'https://s3.example.test');
    await expect(store.put('../etc/passwd', Buffer.from('x'), 'text/plain')).rejects.toThrow(
      /Unsafe storage key/,
    );
    await expect(store.delete(['nested/key.webp'])).rejects.toThrow(/Unsafe storage key/);
    expect(send).not.toHaveBeenCalled();
  });
});

describe('LocalStore', () => {
  const dirs: string[] = [];
  afterAll(async () => {
    await Promise.all(dirs.map((d) => rm(d, { recursive: true, force: true })));
  });

  it('writes, serves at /uploads and deletes files', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'civicfix-store-'));
    dirs.push(dir);
    const store = new LocalStore(path.join(dir, 'uploads'));
    const k = key();

    await store.put(k, Buffer.from('img'));
    expect(existsSync(path.join(store.dir, k))).toBe(true);
    expect(store.publicUrl(k)).toBe(`/uploads/${k}`);

    await store.delete([k, key()]); // a missing key is ignored
    expect(existsSync(path.join(store.dir, k))).toBe(false);
  });
});
