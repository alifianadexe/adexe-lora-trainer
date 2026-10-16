import type { NextConfig } from "next";

// Production: static export served by FastAPI on the same port (no CORS, one process).
// Development: `npm run dev` on :3000 talks to the API on :7860 (see lib/api.ts).
const nextConfig: NextConfig = {
  output: "export",
  trailingSlash: true,
  images: { unoptimized: true },
};

export default nextConfig;
