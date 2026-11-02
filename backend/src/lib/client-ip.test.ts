import { describe, expect, it } from 'vitest';
import { resolveClientIp, secretStatus, type ClientIpInput } from './client-ip.js';

const SECRET = 's'.repeat(40);
const VERCEL = '76.76.21.21';
const CLIENT = '203.0.113.7';

function input(overrides: Partial<ClientIpInput>): ClientIpInput {
  return {
    trustedIp: VERCEL, // what Express resolves with trust proxy = 1 behind Fly
    forwardedClientIp: CLIENT,
    presentedSecret: SECRET,
    expectedSecret: SECRET,
    ...overrides,
  };
}

describe('resolveClientIp', () => {
  it('uses the web proxy client IP when the shared secret matches', () => {
    expect(resolveClientIp(input({}))).toBe(CLIENT);
    expect(resolveClientIp(input({ forwardedClientIp: '2001:db8::1' }))).toBe('2001:db8::1');
  });

  it('ignores the client IP header when no secret is configured', () => {
    expect(resolveClientIp(input({ expectedSecret: undefined }))).toBe(VERCEL);
  });

  it('ignores the client IP header without the secret (direct API call)', () => {
    expect(resolveClientIp(input({ presentedSecret: undefined }))).toBe(VERCEL);
  });

  it('ignores it on a wrong secret, including one of a different length', () => {
    expect(resolveClientIp(input({ presentedSecret: 'x'.repeat(40) }))).toBe(VERCEL);
    expect(resolveClientIp(input({ presentedSecret: 'short' }))).toBe(VERCEL);
  });

  it('falls back when the forwarded client IP is missing or not an IP', () => {
    expect(resolveClientIp(input({ forwardedClientIp: undefined }))).toBe(VERCEL);
    expect(resolveClientIp(input({ forwardedClientIp: 'not-an-ip' }))).toBe(VERCEL);
    expect(resolveClientIp(input({ forwardedClientIp: `${CLIENT}, ${VERCEL}` }))).toBe(VERCEL);
  });

  it('returns "unknown" only when nothing identifies the client', () => {
    expect(resolveClientIp(input({ trustedIp: undefined, expectedSecret: undefined }))).toBe(
      'unknown',
    );
  });
});

describe('secretStatus', () => {
  it('classifies every case', () => {
    expect(secretStatus(undefined, SECRET)).toBe('absent');
    expect(secretStatus(SECRET, undefined)).toBe('unconfigured');
    expect(secretStatus(SECRET, SECRET)).toBe('match');
    expect(secretStatus('nope', SECRET)).toBe('mismatch');
  });
});
