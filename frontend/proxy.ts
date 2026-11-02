import { NextResponse, type NextRequest } from 'next/server';

/**
 * Tells the API who the visitor is on the routes it rate-limits by client IP
 * (sign in, sign up). Without this every visitor would share Vercel's own
 * addresses. Sends a shared secret plus the client IP; the API trusts the IP
 * only when the secret matches (see backend/src/lib/client-ip.ts).
 *
 * The client IP comes from X-Forwarded-For as Vercel presents it here: Vercel
 * overwrites that header with the requester's public IP (anti-spoofing), so
 * its first entry is the visitor. A dedicated header carries it onward because
 * the shape Vercel forwards to an external origin is not documented.
 *
 * The request still reaches the API through the next.config.ts rewrite; this
 * only adds request headers. Scoped to /api/v1/auth because Proxy buffers
 * request bodies (10 MB default), which report uploads exceed.
 */
export const PROXY_SECRET_HEADER = 'x-civicfix-proxy-secret';
export const CLIENT_IP_HEADER = 'x-civicfix-client-ip';

function visitorIp(request: NextRequest): string | undefined {
  const first = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  return first === '' ? undefined : first;
}

export function proxy(request: NextRequest): NextResponse {
  const headers = new Headers(request.headers);
  // Never forward client-supplied values, whatever they are.
  headers.delete(PROXY_SECRET_HEADER);
  headers.delete(CLIENT_IP_HEADER);
  const secret = process.env.PROXY_SHARED_SECRET;
  const ip = visitorIp(request);
  if (secret && ip) {
    headers.set(PROXY_SECRET_HEADER, secret);
    headers.set(CLIENT_IP_HEADER, ip);
  }
  return NextResponse.next({ request: { headers } });
}

export const config = {
  matcher: '/api/v1/auth/:path*',
};
