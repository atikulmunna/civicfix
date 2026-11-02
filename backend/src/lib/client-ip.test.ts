import { describe, expect, it } from 'vitest';
import { resolveClientIp, type ClientIpInput } from './client-ip.js';

const SECRET = 's'.repeat(40);
const VERCEL = '76.76.21.21';
const CLIENT = '203.0.113.7';

function input(overrides: Partial<ClientIpInput>): ClientIpInput {
  return {
    trustedIp: VERCEL, // what Express resolves with trust proxy = 1 behind Fly
    forwardedFor: `${CLIENT}, ${VERCEL}`,
    presentedSecret: SECRET,
    expectedSecret: SECRET,
    trustedHops: 1,
    ...overrides,
  };
}

describe('resolveClientIp', () => {
  it('trusts the web proxy hop when the shared secret matches', () => {
    expect(resolveClientIp(input({}))).toBe(CLIENT);
  });

  it('ignores client-supplied entries left of the web proxy hop', () => {
    // A client may prepend anything; only the entry the web proxy saw counts.
    const forwardedFor = `1.1.1.1, ${CLIENT}, ${VERCEL}`;
    expect(resolveClientIp(input({ forwardedFor }))).toBe(CLIENT);
  });

  it('falls back to the trusted IP when no secret is configured', () => {
    expect(resolveClientIp(input({ expectedSecret: undefined }))).toBe(VERCEL);
  });

  it('falls back when the caller presents no secret (direct API call)', () => {
    expect(resolveClientIp(input({ presentedSecret: undefined }))).toBe(VERCEL);
  });

  it('falls back on a wrong secret, including one of a different length', () => {
    expect(resolveClientIp(input({ presentedSecret: 'x'.repeat(40) }))).toBe(VERCEL);
    expect(resolveClientIp(input({ presentedSecret: 'short' }))).toBe(VERCEL);
  });

  it('falls back when the forwarded entry is missing or not an IP', () => {
    expect(resolveClientIp(input({ forwardedFor: VERCEL }))).toBe(VERCEL);
    expect(resolveClientIp(input({ forwardedFor: `not-an-ip, ${VERCEL}` }))).toBe(VERCEL);
    expect(resolveClientIp(input({ forwardedFor: undefined }))).toBe(VERCEL);
  });

  it('works with no trusted proxies (local Next.js proxy straight to the API)', () => {
    const local = input({ trustedIp: '::1', forwardedFor: CLIENT, trustedHops: 0 });
    expect(resolveClientIp(local)).toBe(CLIENT);
  });

  it('returns "unknown" only when nothing identifies the client', () => {
    expect(resolveClientIp(input({ trustedIp: undefined, expectedSecret: undefined }))).toBe(
      'unknown',
    );
  });
});
