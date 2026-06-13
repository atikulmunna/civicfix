import type { NextConfig } from 'next';

// In production we proxy the API + uploads through this app so the browser only
// talks to one origin — that keeps the httpOnly auth cookies same-site.
// Set BACKEND_URL (e.g. https://civicfix-api.onrender.com) on the host and
// NEXT_PUBLIC_API_URL=/api/v1. Locally BACKEND_URL is unset, so no rewrites are
// added and the app calls NEXT_PUBLIC_API_URL (http://localhost:5000/api/v1).
const backend = process.env.BACKEND_URL;

const nextConfig: NextConfig = {
  async rewrites() {
    if (!backend) return [];
    return [
      { source: '/api/:path*', destination: `${backend}/api/:path*` },
      { source: '/uploads/:path*', destination: `${backend}/uploads/:path*` },
    ];
  },
};

export default nextConfig;
