import { fileURLToPath } from "node:url"
import { defineConfig } from "vitest/config"

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./", import.meta.url)),
      // `server-only` throws outside the Next.js server bundle
      "server-only": fileURLToPath(
        new URL("./tests/stubs/server-only.ts", import.meta.url)
      ),
    },
  },
  test: {
    include: ["tests/**/*.test.{ts,tsx}"],
    exclude: ["tests/e2e/**", "tests/integration/**", "node_modules/**"],
    // Minimum coverage of the business rules, checked in CI with
    // `npm run test:coverage` (RNF07, #77). Views are presentation only
    // and are covered by the accessibility checks and the E2E flow.
    coverage: {
      provider: "v8",
      include: [
        "features/**/action/**/*.ts",
        "features/**/schema/**/*.ts",
        "features/shared/lib/**/*.ts",
        "scripts/**/*.ts",
      ],
      reporter: ["text-summary", "json-summary", "html"],
      reportsDirectory: "coverage",
      // Floor measured on 14/11/2026; raise it as tests are added. The
      // actions of the critical flows (stock, orders, payment, approval)
      // are also covered by `npm run test:integration` against MySQL.
      thresholds: {
        lines: 35,
        statements: 35,
        functions: 42,
        branches: 34,
        // External integrations of the critical flows (frete, pagamento)
        "features/shared/lib/correios/**": { lines: 90, branches: 80 },
        "features/shared/lib/carrier/**": { lines: 90, branches: 80 },
        "features/shared/lib/mercadopago/**": { lines: 80, branches: 75 },
        "features/shared/lib/security/**": { lines: 95, branches: 95 },
      },
    },
  },
})
