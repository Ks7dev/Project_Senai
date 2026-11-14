import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it, vi } from "vitest"
import budget from "@/performance-budget.json"
import { measurePath, percentile } from "@/scripts/api-latency"
import {
  findBudgetViolations,
  firstLoadFiles,
} from "@/scripts/performance-budget"

const ROUTE = "/(store)/produto/[slug]/page"

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("performance targets (RNF10)", () => {
  it("records the targets of the requirement", () => {
    expect(budget.targets).toEqual({ lcpSeconds: 2.5, apiP95Ms: 500 })
  })

  it("budgets every storefront route", () => {
    const routes = budget.routes.map((item) => item.route)
    expect(routes).toEqual(
      expect.arrayContaining([
        "/(store)/page",
        "/(store)/categoria/[slug]/page",
        ROUTE,
      ])
    )
  })
})

describe("percentile", () => {
  it("uses the nearest rank", () => {
    const samples = Array.from({ length: 100 }, (_, i) => i + 1)
    expect(percentile(samples, 95)).toBe(95)
    expect(percentile(samples, 50)).toBe(50)
    expect(percentile([30, 10, 20], 95)).toBe(30)
    expect(percentile([], 95)).toBe(0)
  })
})

describe("API latency probe", () => {
  it("counts failed and non-2xx responses as errors", async () => {
    let call = 0
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        call++
        if (call === 1) throw new Error("timeout")
        return new Response("ok", { status: call === 2 ? 500 : 200 })
      })
    )
    const result = await measurePath("http://server.test", "/api/health", 5, 2)
    expect(result.path).toBe("/api/health")
    expect(result.errors).toBe(2)
    expect(result.p95Ms).toBeGreaterThanOrEqual(0)
  })
})

describe("bundle budget", () => {
  it("reports routes over the JS or CSS budget", () => {
    const violations = findBudgetViolations(
      [
        { route: "/a", jsKb: 300, cssKb: 10 },
        { route: "/b", jsKb: 100, cssKb: 20 },
      ],
      [
        { route: "/a", maxJsKb: 250, maxCssKb: 15 },
        { route: "/b", maxJsKb: 250, maxCssKb: 15 },
        { route: "/c", maxJsKb: 250, maxCssKb: 15 },
      ]
    )
    expect(violations).toEqual([
      "/a: JS 300 KB > 250 KB (gzip)",
      "/b: CSS 20 KB > 15 KB (gzip)",
      "/c: route not found in the build",
    ])
  })

  it("collects the first-load files of a route from the build output", () => {
    const nextDir = mkdtempSync(join(tmpdir(), "perf-budget-"))
    try {
      const routeDir = join(nextDir, "server", "app", ROUTE)
      mkdirSync(routeDir, { recursive: true })
      writeFileSync(
        join(routeDir, "build-manifest.json"),
        JSON.stringify({ rootMainFiles: ["static/chunks/runtime.js"] })
      )
      const manifest = {
        entryJSFiles: {
          "[project]/app/layout": ["static/chunks/layout.js"],
          [`[project]/app${ROUTE}`]: [
            "static/chunks/layout.js",
            "static/chunks/page.js",
          ],
          "[project]/app/global-error": ["static/chunks/global-error.js"],
        },
        entryCSSFiles: {
          "[project]/app/layout": [{ path: "static/chunks/app.css" }],
        },
      }
      writeFileSync(
        join(nextDir, "server", "app", `${ROUTE}_client-reference-manifest.js`),
        `globalThis.__RSC_MANIFEST = globalThis.__RSC_MANIFEST || {};\nglobalThis.__RSC_MANIFEST[${JSON.stringify(ROUTE)}] = ${JSON.stringify(manifest)};`
      )
      expect(firstLoadFiles(nextDir, ROUTE)).toEqual({
        js: [
          "static/chunks/runtime.js",
          "static/chunks/layout.js",
          "static/chunks/page.js",
        ],
        css: ["static/chunks/app.css"],
      })
    } finally {
      rmSync(nextDir, { recursive: true, force: true })
    }
  })
})
