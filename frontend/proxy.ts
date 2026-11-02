import { NextResponse, type NextRequest } from 'next/server';

/**
 * Authenticates this web app to the API on the routes the API rate-limits by
 * client IP (sign in, sign up). The API trusts the client IP that Vercel
 * forwarded only when this secret matches (see backend/src/lib/client-ip.ts);
 * otherwise every visitor would share Vercel's egress IPs in one bucket.
 *
 * The request still reaches the API through the existing next.config.ts
 * rewrite; this only adds a request header. Scoped to /api/v1/auth because
 * Proxy buffers request bodies (10 MB default), which report uploads exceed.
 */
export const PROXY_SECRET_HEADER = 'x-civicfix-proxy-secret';

export function proxy(request: NextRequest): NextResponse {
  const headers = new Headers(request.headers);
  // Never forward a client-supplied value, whatever it is.
  headers.delete(PROXY_SECRET_HEADER);
  const secret = process.env.PROXY_SHARED_SECRET;
  if (secret) headers.set(PROXY_SECRET_HEADER, secret);
  return NextResponse.next({ request: { headers } });
}

export const config = {
  matcher: '/api/v1/auth/:path*',
};
