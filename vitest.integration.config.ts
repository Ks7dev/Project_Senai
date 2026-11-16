import { fileURLToPath } from "node:url"
import { defineConfig } from "vitest/config"

const path = (file: string) => fileURLToPath(new URL(file, import.meta.url))

/**
 * Integration tests against a real MySQL (RNF07): run the server
 * actions with Prisma and Better Auth for real. Needs DATABASE_URL with
 * the seed applied: `npm run test:integration`.
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": path("./"),
      "server-only": path("./tests/stubs/server-only.ts"),
      "next/headers.js": path("./tests/integration/next-headers-stub.ts"),
      "next/headers": path("./tests/integration/next-headers-stub.ts"),
    },
  },
  test: {
    include: ["tests/integration/**/*.test.ts"],
    fileParallelism: false,
    testTimeout: 30_000,
    server: { deps: { inline: [/better-auth/] } },
  },
})
