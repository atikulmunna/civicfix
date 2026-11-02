/**
 * Client IP resolution for per-client rate limiting.
 *
 * Production chain: browser -> Vercel (web app proxy) -> Fly edge -> API.
 * - Express's `trust proxy` is TRUST_PROXY_HOPS (1 on Fly), so req.ip is the
 *   address that connected to Fly. For direct API calls that is the real
 *   client; for traffic through the web app it is a shared Vercel egress IP.
 * - The web app's proxy (frontend/proxy.ts) adds PROXY_SECRET_HEADER on the
 *   routes we limit by IP. Only when it matches PROXY_SHARED_SECRET do we trust
 *   one more X-Forwarded-For hop: the client address Vercel saw. Without the
 *   secret, entries left of the trusted hops are client-controlled and ignored,
 *   so calling the API directly cannot spoof another IP.
 */
import { timingSafeEqual } from 'node:crypto';
import { isIP } from 'node:net';
import type { Request } from 'express';
import { env } from '../config/env.js';

export const PROXY_SECRET_HEADER = 'x-civicfix-proxy-secret';

export interface ClientIpInput {
  /** req.ip as resolved by Express's `trust proxy` setting. */
  trustedIp: string | undefined;
  /** Raw X-Forwarded-For header. */
  forwardedFor: string | undefined;
  /** Secret presented by the caller, if any. */
  presentedSecret: string | undefined;
  /** Configured shared secret; undefined disables the extra hop entirely. */
  expectedSecret: string | undefined;
  /** Proxies whose X-Forwarded-For entries Express already trusts. */
  trustedHops: number;
}

function secretsMatch(presented: string, expected: string): boolean {
  const a = Buffer.from(presented);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Pure resolver (unit tested); see the module comment for the trust model. */
export function resolveClientIp(input: ClientIpInput): string {
  const fallback = input.trustedIp ?? 'unknown';
  const { presentedSecret, expectedSecret } = input;
  if (!expectedSecret || !presentedSecret || !secretsMatch(presentedSecret, expectedSecret)) {
    return fallback;
  }
  const hops = (input.forwardedFor ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s !== '');
  // Trusted proxies appended the last `trustedHops` entries; the web proxy's
  // view of the client sits immediately to their left.
  const candidate = hops[hops.length - input.trustedHops - 1];
  return candidate !== undefined && isIP(candidate) !== 0 ? candidate : fallback;
}

/** The originating client IP for this request (used as the rate-limit key). */
export function clientIp(req: Request): string {
  return resolveClientIp({
    trustedIp: req.ip,
    forwardedFor: req.header('x-forwarded-for'),
    presentedSecret: req.header(PROXY_SECRET_HEADER),
    expectedSecret: env.PROXY_SHARED_SECRET,
    trustedHops: env.TRUST_PROXY_HOPS,
  });
}
