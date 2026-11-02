import { describe, expect, it } from 'vitest';
import { parseEnv } from './env.js';

const base = {
  DATABASE_URL: 'postgresql://u:p@localhost:5432/db',
  JWT_ACCESS_SECRET: 'a-test-secret-of-sufficient-length',
};

const s3 = {
  UPLOAD_PROVIDER: 's3',
  S3_BUCKET: 'report-images',
  AWS_ENDPOINT_URL_S3: 'https://s3.example.test',
  AWS_REGION: 'ap-southeast-1',
  AWS_ACCESS_KEY_ID: 'key-id',
  AWS_SECRET_ACCESS_KEY: 'key-secret',
};

describe('parseEnv', () => {
  it('defaults to local uploads without any bucket settings', () => {
    expect(parseEnv(base).UPLOAD_PROVIDER).toBe('local');
  });

  it('accepts a complete S3 configuration', () => {
    const env = parseEnv({ ...base, ...s3 });
    expect(env.UPLOAD_PROVIDER).toBe('s3');
    expect(env.S3_BUCKET).toBe('report-images');
  });

  it('fails at startup when S3 is selected but settings are missing', () => {
    const partial = { ...base, UPLOAD_PROVIDER: 's3', S3_BUCKET: 'report-images' };
    expect(() => parseEnv(partial)).toThrow(
      /AWS_ENDPOINT_URL_S3: Required when UPLOAD_PROVIDER=s3/,
    );
    expect(() => parseEnv(partial)).toThrow(/AWS_SECRET_ACCESS_KEY/);
  });

  it('treats an empty proxy secret as unset but rejects a short one', () => {
    expect(parseEnv({ ...base, PROXY_SHARED_SECRET: '' }).PROXY_SHARED_SECRET).toBeUndefined();
    expect(() => parseEnv({ ...base, PROXY_SHARED_SECRET: 'short' })).toThrow(/32 chars/);
  });
});
