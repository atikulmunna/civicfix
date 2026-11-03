import { describe, expect, it } from 'vitest';
import { withVerifiedTls } from './prisma-client.js';

const neon = 'postgresql://u:p@ep-x-pooler.ap-southeast-1.aws.neon.tech/neondb';

describe('withVerifiedTls', () => {
  it.each(['require', 'prefer', 'verify-ca'])('upgrades sslmode=%s to verify-full', (mode) => {
    const out = new URL(withVerifiedTls(`${neon}?sslmode=${mode}&channel_binding=require`));
    expect(out.searchParams.get('sslmode')).toBe('verify-full');
    expect(out.searchParams.get('channel_binding')).toBe('require');
    expect(out.host).toBe('ep-x-pooler.ap-southeast-1.aws.neon.tech');
    expect(out.username).toBe('u');
  });

  it('leaves URLs without sslmode, or with a deliberate mode, untouched', () => {
    const local = 'postgresql://civicfix:civicfix@localhost:5434/civicfix';
    expect(withVerifiedTls(local)).toBe(local);
    expect(withVerifiedTls(`${neon}?sslmode=verify-full`)).toBe(`${neon}?sslmode=verify-full`);
    expect(withVerifiedTls(`${neon}?sslmode=disable`)).toBe(`${neon}?sslmode=disable`);
  });

  it('keeps percent-encoded credentials intact', () => {
    const url = 'postgresql://user:p%40ss%2Fword@host/db?sslmode=require';
    const out = new URL(withVerifiedTls(url));
    expect(decodeURIComponent(out.password)).toBe('p@ss/word');
  });

  it('passes through strings that are not URLs', () => {
    expect(withVerifiedTls('host=localhost dbname=x')).toBe('host=localhost dbname=x');
  });
});
