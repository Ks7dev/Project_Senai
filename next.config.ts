import type { NextConfig } from "next"
import {
  buildContentSecurityPolicy,
  securityHeaders,
  STATIC_CSP_SOURCE,
} from "./features/shared/lib/security/headers"

const isDev = process.env.NODE_ENV !== "production"

const nextConfig: NextConfig = {
  // Self-contained server for the Docker image (#7)
  output: "standalone",
  poweredByHeader: false,
  cacheComponents: true,
  experimental: {
    // Product images up to 10 MB plus multipart overhead (#22)
    serverActions: { bodySizeLimit: "11mb" },
  },
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
   * Security headers on every route (RNF06, #11). The static CSP covers
   * every page but the payment page, whose CSP with a per request nonce
   * is set by the proxy (#173).
   *
   * @returns Header rules.
   */
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders() },
      {
        source: STATIC_CSP_SOURCE,
        headers: [
          {
            key: "Content-Security-Policy",
            value: buildContentSecurityPolicy(isDev),
          },
        ],
      },
    ]
  },
}

export default nextConfig
