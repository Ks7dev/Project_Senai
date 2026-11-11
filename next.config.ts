import type { NextConfig } from "next"
import { securityHeaders } from "./features/shared/lib/security/headers"

const isDev = process.env.NODE_ENV !== "production"

const nextConfig: NextConfig = {
  // Self-contained server for the Docker image (#7)
  output: "standalone",
  poweredByHeader: false,
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  /**
   * Security headers on every route (RNF06, #11).
   *
   * @returns Header rules.
   */
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders(isDev) }]
  },
}

export default nextConfig
