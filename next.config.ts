import type { NextConfig } from "next";

// NEXT_PUBLIC_LIVE_SEARCH=1 enables the live arbitrary-coordinate search path.
// In a static export (output: 'export') this env var is 0/unset, and the UI
// shows "Live search: coming soon" without calling any server.
const liveSearch = process.env.NEXT_PUBLIC_LIVE_SEARCH === '1'

const nextConfig: NextConfig = {
  output: 'export',         // fully static — generates out/
  trailingSlash: true,      // /viewer → out/viewer/index.html (deep links work)

  // Static export does not serve images through Next's image optimiser;
  // we use plain <img> tags throughout so this is fine.
  images: {
    unoptimized: true,
  },

  env: {
    NEXT_PUBLIC_LIVE_SEARCH: liveSearch ? '1' : '0',
  },
}

export default nextConfig
