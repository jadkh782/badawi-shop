import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,

  /*
    The app builds to plain static files.

    Every screen is client rendered and talks to Supabase directly, so there was never any
    server-side work to keep: dropping it means the same output can be served from any host
    and packaged inside the Android app, where there is no server to call at all.
  */
  output: 'export',
  images: { unoptimized: true },

  // Directory-style URLs, which is what a file-served bundle and a WebView both expect.
  trailingSlash: true,
};

export default nextConfig;
