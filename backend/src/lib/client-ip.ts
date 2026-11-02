/**
 * Client IP resolution for per-client rate limiting.
 *
 * Production chain: browser -> Vercel (web app) -> Fly edge -> API.
 * - Express's `trust proxy` is TRUST_PROXY_HOPS (1 on Fly), so req.ip is the
 *   address that connected to Fly. For direct API calls that is the real
 *   client; for traffic through the web app it is one of Vercel's addresses,
 *   shared by many visitors.
 * - The web app's proxy (frontend/proxy.ts) sends PROXY_SECRET_HEADER plus the
 *   client IP Vercel reported in CLIENT_IP_HEADER. Only when the secret
 *   matches PROXY_SHARED_SECRET is that IP trusted. A dedicated header is used
 *   because how Vercel formats X-Forwarded-For towards an external origin is
 *   not documented, so counting hops in it is fragile. Callers without the
 *   secret cannot influence the key: they are keyed on req.ip.
 */
import { timingSafeEqual } from 'node:crypto';
import { isIP } from 'node:net';
import type { Request } from 'express';
import { env } from '../config/env.js';

export const PROXY_SECRET_HEADER = 'x-civicfix-proxy-secret';
export const CLIENT_IP_HEADER = 'x-civicfix-client-ip';

export type SecretStatus = 'absent' | 'unconfigured' | 'match' | 'mismatch';

export interface ClientIpInput {
  /** req.ip as resolved by Express's `trust proxy` setting. */
  trustedIp: string | undefined;
  /** CLIENT_IP_HEADER as sent by the web proxy. */
  forwardedClientIp: string | undefined;
  /** Secret presented by the caller, if any. */
  presentedSecret: string | undefined;
  /** Configured shared secret; undefined disables the web-proxy path. */
  expectedSecret: string | undefined;
}

function secretsMatch(presented: string, expected: string): boolean {
  const a = Buffer.from(presented);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function secretStatus(
  presented: string | undefined,
  expected: string | undefined,
): SecretStatus {
  if (!presented) return 'absent';
  if (!expected) return 'unconfigured';
  return secretsMatch(presented, expected) ? 'match' : 'mismatch';
}

/** Pure resolver (unit tested); see the module comment for the trust model. */
export function resolveClientIp(input: ClientIpInput): string {
  const fallback = input.trustedIp ?? 'unknown';
  if (secretStatus(input.presentedSecret, input.expectedSecret) !== 'match') return fallback;
  const forwarded = input.forwardedClientIp?.trim();
  return forwarded && isIP(forwarded) !== 0 ? forwarded : fallback;
}

// One log line per status per process, so a deploy shows whether the web
// proxy is authenticating, without logging any IP addresses.
const reported = new Set<SecretStatus>();
function reportOnce(status: SecretStatus): void {
  if (status === 'absent' || reported.has(status)) return;
  reported.add(status);
  if (status === 'match') {
    console.info('[client-ip] web proxy authenticated; rate limits use its forwarded client IP');
  } else {
    console.warn(
      `[client-ip] web proxy secret ${status}; check PROXY_SHARED_SECRET on Fly and Vercel`,
    );
  }
}

/** The originating client IP for this request (used as the rate-limit key). */
export function clientIp(req: Request): string {
  const presentedSecret = req.header(PROXY_SECRET_HEADER);
  reportOnce(secretStatus(presentedSecret, env.PROXY_SHARED_SECRET));
  return resolveClientIp({
    trustedIp: req.ip,
    forwardedClientIp: req.header(CLIENT_IP_HEADER),
    presentedSecret,
    expectedSecret: env.PROXY_SHARED_SECRET,
  });
}
