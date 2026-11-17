import { afterEach, describe, expect, it, vi } from "vitest"
import budget from "@/performance-budget.json"
import {
  evaluateLoad,
  parseOptions,
  pickPath,
  renderReport,
  runPhase,
  summarizePhase,
  type PhaseStats,
  type Sample,
} from "@/scripts/load-test"

afterEach(() => {
  vi.unstubAllGlobals()
})

const LIMITS = budget.loadTest.limits

/**
 * Builds a phase with fixed statistics for the evaluation tests.
 *
 * @param overrides - Values that differ from a healthy phase.
 * @returns The phase statistics.
 */
function phase(overrides: Partial<PhaseStats> = {}): PhaseStats {
  return {
    users: 10,
    durationSeconds: 60,
    throughput: 9,
    requests: 540,
    errors: 0,
    errorRate: 0,
    p50Ms: 80,
    p95Ms: 200,
    p99Ms: 300,
    byPath: [],
    ...overrides,
  }
}

describe("load test settings (RNF02)", () => {
  it("simulates 3x the average traffic over the storefront routes", () => {
    expect(budget.loadTest.multiplier).toBe(3)
    const paths = budget.loadTest.paths.map((item) => item.path)
    expect(paths).toContain("/")
    expect(paths.some((path) => path.startsWith("/categoria/"))).toBe(true)
    expect(paths.some((path) => path.startsWith("/produto/"))).toBe(true)
    expect(paths.some((path) => path.startsWith("/busca"))).toBe(true)
  })

  it("reads the defaults and the command line overrides", () => {
    const defaults = parseOptions([])
    expect(defaults.baseUrl).toBe("http://localhost:3000")
    expect(defaults.baselineUsers).toBe(budget.loadTest.baselineUsers)
    expect(defaults.out).toBe("")

    const custom = parseOptions([
      "https://192.168.0.50/",
      "--users",
      "20",
      "--duration",
      "30",
      "--think",
      "500",
      "--out",
      "report.md",
    ])
    expect(custom).toMatchObject({
      baseUrl: "https://192.168.0.50",
      baselineUsers: 20,
      durationSeconds: 30,
      thinkTimeMs: 500,
      out: "report.md",
    })
  })

  it("rejects invalid numbers", () => {
    expect(() => parseOptions(["--users", "abc"])).toThrow("invalid number")
  })
})

describe("pickPath", () => {
  const paths = [
    { path: "/a", weight: 1 },
    { path: "/b", weight: 3 },
  ]

  it("picks the paths in proportion to their weight", () => {
    expect(pickPath(paths, 0)).toBe("/a")
    expect(pickPath(paths, 0.24)).toBe("/a")
    expect(pickPath(paths, 0.25)).toBe("/b")
    expect(pickPath(paths, 0.99)).toBe("/b")
  })
})

describe("summarizePhase", () => {
  it("computes percentiles, error rate and throughput by path", () => {
    const samples: Sample[] = [
      ...Array.from({ length: 99 }, (_, i) => ({
        path: "/",
        ms: i + 1,
        ok: true,
      })),
      { path: "/busca?q=caneta", ms: 1000, ok: false },
    ]
    const stats = summarizePhase(samples, 10, 10)
    expect(stats).toMatchObject({
      requests: 100,
      errors: 1,
      errorRate: 0.01,
      p50Ms: 50,
      p95Ms: 95,
      p99Ms: 99,
      throughput: 10,
    })
    expect(stats.byPath.map((item) => item.path)).toEqual([
      "/",
      "/busca?q=caneta",
    ])
    expect(stats.byPath[1]).toMatchObject({ requests: 1, errors: 1 })
  })
})

describe("evaluateLoad", () => {
  it("passes a load within the limits", () => {
    expect(evaluateLoad(phase(), phase({ p95Ms: 350 }), LIMITS)).toEqual([])
  })

  it("reports latency, errors and degradation over the limits", () => {
    const violations = evaluateLoad(
      phase({ p95Ms: 100 }),
      phase({ p95Ms: 900, p99Ms: 2000, errorRate: 0.05, errors: 27 }),
      LIMITS
    )
    expect(violations).toEqual([
      `p95 900 ms > ${LIMITS.p95Ms} ms`,
      `p99 2000 ms > ${LIMITS.p99Ms} ms`,
      "error rate 5,00% > 1,00%",
      `p95 degradation 9.00x > ${LIMITS.maxP95Degradation}x`,
    ])
  })

  it("fails when no request completed", () => {
    expect(
      evaluateLoad(phase(), phase({ requests: 0, p95Ms: 0, p99Ms: 0 }), LIMITS)
    ).toContain("no request completed under load")
  })
})

describe("runPhase", () => {
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
    const samples = await runPhase({
      baseUrl: "http://server.test",
      paths: [{ path: "/", weight: 1 }],
      users: 2,
      durationMs: 300,
      thinkTimeMs: 1,
      timeoutMs: 1000,
    })
    expect(samples.length).toBeGreaterThanOrEqual(3)
    expect(samples.filter((sample) => !sample.ok)).toHaveLength(2)
    expect(samples.every((sample) => sample.path === "/")).toBe(true)
  })
})

describe("renderReport", () => {
  it("writes the phases, the limits and the violations in Markdown", () => {
    const config = parseOptions(["http://server.test"])
    const load = phase({
      users: 30,
      p95Ms: 900,
      byPath: [
        {
          path: "/",
          requests: 10,
          errors: 0,
          errorRate: 0,
          p50Ms: 1,
          p95Ms: 2,
          p99Ms: 3,
        },
      ],
    })
    const report = renderReport({
      config,
      baseline: phase(),
      load,
      violations: ["p95 900 ms > 500 ms"],
      date: new Date("2026-11-17T12:00:00Z"),
    })
    expect(report).toContain("# Relatório do teste de carga (RNF02)")
    expect(report).toContain("premissa a validar")
    expect(report).toContain("**Resultado:** reprovado")
    expect(report).toContain("| Carga (3x) | 30 |")
    expect(report).toContain("| `/` | 10 |")
    expect(report).toContain("- p95 900 ms > 500 ms")
  })
})
