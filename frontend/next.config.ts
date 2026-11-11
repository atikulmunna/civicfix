import path from 'node:path';
import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

// In production we proxy the API + uploads through this app so the browser only
// talks to one origin, which keeps the httpOnly auth cookies same-site.
// Set BACKEND_URL (e.g. https://civicfix-api.fly.dev) on the host and
// NEXT_PUBLIC_API_URL=/api/v1. Locally BACKEND_URL is unset, so no rewrites are
// added and the app calls NEXT_PUBLIC_API_URL (http://localhost:5000/api/v1).
// proxy.ts adds the API shared secret on auth routes before these rewrites run.
const backend = process.env.BACKEND_URL;
// Optional: public base URL of the report-images bucket, e.g.
// https://<branch>.storage.<region>.aws.neon.tech/report-images. When set,
// /uploads is served from the bucket directly (objects carry immutable cache
// headers, so the CDN can keep them); otherwise the API redirects there.
const uploads = process.env.UPLOADS_URL?.replace(/\/+$/, '');

const nextConfig: NextConfig = {
  // The repo root has its own package-lock.json (shared tooling), so pin the
  // app root explicitly instead of letting Next.js guess between lockfiles.
  outputFileTracingRoot: path.join(__dirname),
  // Report photos go through next/image (resized per device, cached by the
  // CDN). Allowed sources: same-origin uploads (keys have no query string)
  // and the seed photos. Locally, uploads come from the API on localhost,
  // which Next 16 refuses to optimize (dangerouslyAllowLocalIP), so images are
  // served as they are there.
  images: backend
    ? {
        localPatterns: [{ pathname: '/uploads/**', search: '' }],
        remotePatterns: [{ protocol: 'https', hostname: 'images.unsplash.com', pathname: '/**' }],
        qualities: [75],
      }
    : { unoptimized: true },
  async rewrites() {
    if (!backend) return [];
    return [
      { source: '/api/:path*', destination: `${backend}/api/:path*` },
      { source: '/uploads/:path*', destination: `${uploads ?? `${backend}/uploads`}/:path*` },
    ];
  },
};

// Translations (F5): i18n/request.ts picks each request's language and messages.
const withNextIntl = createNextIntlPlugin('./i18n/request.ts');

export default withNextIntl(nextConfig);
