import { pathToFileURL } from "node:url"
import budget from "../performance-budget.json" with { type: "json" }

/** Latency measured for one path. */
export type PathLatency = {
  path: string
  p95Ms: number
  medianMs: number
  errors: number
}

/**
 * Nearest-rank percentile of a list of samples.
 *
 * @param samples - Values (any order).
 * @param p - Percentile between 0 and 100.
 * @returns The percentile, or 0 for an empty list.
 */
export function percentile(samples: number[], p: number): number {
  if (samples.length === 0) return 0
  const sorted = [...samples].sort((a, b) => a - b)
  const rank = Math.ceil((p / 100) * sorted.length)
  return sorted[Math.min(sorted.length, Math.max(1, rank)) - 1]
}

/**
 * Requests a path `count` times with `concurrency` parallel clients
 * and measures the time to the full response body.
 *
 * @param baseUrl - Server address, e.g. https://192.168.0.50.
 * @param path - Path to request.
 * @param count - Number of requests.
 * @param concurrency - Parallel clients.
 * @returns The latency of the path.
 */
export async function measurePath(
  baseUrl: string,
  path: string,
  count: number,
  concurrency: number
): Promise<PathLatency> {
  const samples: number[] = []
  let errors = 0
  let next = 0
  const worker = async () => {
    while (next < count) {
      next++
      const start = performance.now()
      try {
        const response = await fetch(`${baseUrl}${path}`, {
          signal: AbortSignal.timeout(10_000),
        })
        await response.arrayBuffer()
        if (!response.ok) errors++
      } catch {
        errors++
      }
      samples.push(performance.now() - start)
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker))
  return {
    path,
    p95Ms: Math.round(percentile(samples, 95)),
    medianMs: Math.round(percentile(samples, 50)),
    errors,
  }
}

/**
 * Measures the p95 response time of the paths listed in
 * performance-budget.json against a running server and fails when one
 * exceeds the target of RNF10 (500 ms) or returns errors. Needs the
 * app with its database, so it runs on the local server, not in CI:
 * `npm run perf:api -- https://<server-ip>`.
 *
 * @param args - Command line arguments: base URL, requests per path.
 * @returns Process exit code.
 */
export async function main(args: string[]): Promise<number> {
  const baseUrl = (args[0] ?? "http://localhost:3000").replace(/\/$/, "")
  const count = Number(args[1] ?? 100)
  const target = budget.targets.apiP95Ms
  // Warm up the caches once, as a returning visitor would find them
  for (const path of budget.apiPaths) {
    await measurePath(baseUrl, path, 2, 1)
  }
  let failed = false
  for (const path of budget.apiPaths) {
    const result = await measurePath(baseUrl, path, count, 10)
    const over = result.p95Ms > target || result.errors > 0
    failed ||= over
    process.stdout.write(
      `${over ? "FAIL" : "ok  "} ${path}: p95 ${result.p95Ms} ms, median ${result.medianMs} ms, errors ${result.errors}\n`
    )
  }
  return failed ? 1 : 0
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main(process.argv.slice(2)).then((code) => process.exit(code))
}
