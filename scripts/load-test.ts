import { mkdirSync, writeFileSync } from "node:fs"
import { dirname } from "node:path"
import { pathToFileURL } from "node:url"
import { parseArgs } from "node:util"
import budget from "../performance-budget.json" with { type: "json" }
import { percentile } from "./api-latency"

/** Storefront path requested by the virtual users, with its weight. */
export type LoadPath = { path: string; weight: number }

/** Limits that the load phase must respect (RNF02). */
export type LoadLimits = {
  /** Maximum p95 latency under load, in ms. */
  p95Ms: number
  /** Maximum p99 latency under load, in ms. */
  p99Ms: number
  /** Maximum share of failed requests (0 to 1). */
  maxErrorRate: number
  /** Maximum ratio between the p95 under load and the baseline p95. */
  maxP95Degradation: number
}

/** Load test settings, read from performance-budget.json. */
export type LoadConfig = {
  baseUrl: string
  /** Simultaneous users of the average traffic (premise to validate). */
  baselineUsers: number
  /** Traffic multiplier of the load phase (RNF02: 3x). */
  multiplier: number
  durationSeconds: number
  /** Mean pause of a user between two pages, in ms. */
  thinkTimeMs: number
  timeoutMs: number
  limits: LoadLimits
  paths: LoadPath[]
  /** Markdown report file; empty writes only to stdout. */
  out: string
}

/** One request made during a phase. */
export type Sample = { path: string; ms: number; ok: boolean }

/** Latency of the requests of one path, or of a whole phase. */
export type LatencyStats = {
  requests: number
  errors: number
  errorRate: number
  p50Ms: number
  p95Ms: number
  p99Ms: number
}

/** Result of one phase (baseline or load). */
export type PhaseStats = LatencyStats & {
  users: number
  durationSeconds: number
  /** Requests per second. */
  throughput: number
  byPath: Array<LatencyStats & { path: string }>
}

/**
 * Picks a path at random, in proportion to its weight.
 *
 * @param paths - Weighted paths (weights greater than zero).
 * @param random - Number in [0, 1), `Math.random()` by default.
 * @returns The chosen path.
 */
export function pickPath(paths: LoadPath[], random = Math.random()): string {
  const total = paths.reduce((sum, item) => sum + item.weight, 0)
  let threshold = random * total
  for (const item of paths) {
    threshold -= item.weight
    if (threshold < 0) return item.path
  }
  return paths[paths.length - 1].path
}

/**
 * Latency percentiles and error rate of a list of samples.
 *
 * @param samples - Requests made.
 * @returns The statistics, with zeros for an empty list.
 */
export function latencyStats(samples: Sample[]): LatencyStats {
  const times = samples.map((sample) => sample.ms)
  const errors = samples.filter((sample) => !sample.ok).length
  return {
    requests: samples.length,
    errors,
    errorRate: samples.length === 0 ? 0 : errors / samples.length,
    p50Ms: Math.round(percentile(times, 50)),
    p95Ms: Math.round(percentile(times, 95)),
    p99Ms: Math.round(percentile(times, 99)),
  }
}

/**
 * Summarizes the samples of a phase, overall and by path.
 *
 * @param samples - Requests made during the phase.
 * @param users - Simultaneous virtual users.
 * @param durationSeconds - Length of the phase.
 * @returns The phase statistics.
 */
export function summarizePhase(
  samples: Sample[],
  users: number,
  durationSeconds: number
): PhaseStats {
  const paths = [...new Set(samples.map((sample) => sample.path))].sort()
  return {
    ...latencyStats(samples),
    users,
    durationSeconds,
    throughput:
      durationSeconds > 0
        ? Math.round((samples.length / durationSeconds) * 10) / 10
        : 0,
    byPath: paths.map((path) => ({
      path,
      ...latencyStats(samples.filter((sample) => sample.path === path)),
    })),
  }
}

/**
 * Runs `users` virtual users against the server for `durationMs`. Each
 * user requests a weighted random path, reads the full body and waits
 * a think time of 50% to 150% of `thinkTimeMs` before the next page.
 * Network failures, timeouts and non-2xx responses count as errors.
 *
 * @param options - Server, paths, users, duration and timings.
 * @returns The requests made.
 */
export async function runPhase(options: {
  baseUrl: string
  paths: LoadPath[]
  users: number
  durationMs: number
  thinkTimeMs: number
  timeoutMs: number
}): Promise<Sample[]> {
  const samples: Sample[] = []
  const deadline = performance.now() + options.durationMs
  const pause = (ms: number) =>
    new Promise((resolve) => setTimeout(resolve, ms))
  const user = async (index: number) => {
    // Stagger the start so the users do not move in lockstep
    await pause((options.thinkTimeMs * index) / options.users)
    while (performance.now() < deadline) {
      const path = pickPath(options.paths)
      const start = performance.now()
      let ok = false
      try {
        const response = await fetch(`${options.baseUrl}${path}`, {
          signal: AbortSignal.timeout(options.timeoutMs),
        })
        await response.arrayBuffer()
        ok = response.ok
      } catch {
        ok = false
      }
      samples.push({ path, ms: performance.now() - start, ok })
      await pause(options.thinkTimeMs * (0.5 + Math.random()))
    }
  }
  await Promise.all(Array.from({ length: options.users }, (_, i) => user(i)))
  return samples
}

/**
 * Checks the load phase against the limits and against the baseline.
 *
 * @param baseline - Phase with the average traffic.
 * @param load - Phase with the multiplied traffic.
 * @param limits - Accepted latency, error rate and degradation.
 * @returns One message per violated limit (empty when it passes).
 */
export function evaluateLoad(
  baseline: PhaseStats,
  load: PhaseStats,
  limits: LoadLimits
): string[] {
  const violations: string[] = []
  if (load.requests === 0) violations.push("no request completed under load")
  if (load.p95Ms > limits.p95Ms)
    violations.push(`p95 ${load.p95Ms} ms > ${limits.p95Ms} ms`)
  if (load.p99Ms > limits.p99Ms)
    violations.push(`p99 ${load.p99Ms} ms > ${limits.p99Ms} ms`)
  if (load.errorRate > limits.maxErrorRate)
    violations.push(
      `error rate ${formatPercent(load.errorRate)} > ${formatPercent(limits.maxErrorRate)}`
    )
  const degradation = p95Degradation(baseline, load)
  if (degradation > limits.maxP95Degradation)
    violations.push(
      `p95 degradation ${degradation.toFixed(2)}x > ${limits.maxP95Degradation}x`
    )
  return violations
}

/**
 * Ratio between the p95 under load and the baseline p95.
 *
 * @param baseline - Phase with the average traffic.
 * @param load - Phase with the multiplied traffic.
 * @returns The ratio, or 1 when the baseline p95 is zero.
 */
export function p95Degradation(baseline: PhaseStats, load: PhaseStats): number {
  return baseline.p95Ms > 0 ? load.p95Ms / baseline.p95Ms : 1
}

function formatPercent(rate: number): string {
  return `${(rate * 100).toFixed(2).replace(".", ",")}%`
}

function phaseRow(name: string, phase: PhaseStats): string {
  return `| ${name} | ${phase.users} | ${phase.requests} | ${String(phase.throughput).replace(".", ",")} | ${phase.p50Ms} | ${phase.p95Ms} | ${phase.p99Ms} | ${phase.errors} (${formatPercent(phase.errorRate)}) |`
}

/**
 * Writes the load test report in Markdown (pt-BR, as the other docs).
 *
 * @param input - Settings, both phases, violations and run date.
 * @returns The Markdown report.
 */
export function renderReport(input: {
  config: LoadConfig
  baseline: PhaseStats
  load: PhaseStats
  violations: string[]
  date: Date
}): string {
  const { config, baseline, load, violations } = input
  const { limits } = config
  const passed = violations.length === 0
  const lines = [
    "# Relatório do teste de carga (RNF02)",
    "",
    `- **Data:** ${input.date.toISOString()}`,
    `- **Servidor:** ${config.baseUrl}`,
    `- **Premissa de tráfego médio:** ${config.baselineUsers} usuários simultâneos, pausa média de ${config.thinkTimeMs} ms entre páginas (premissa a validar)`,
    `- **Carga:** ${config.multiplier}x (${load.users} usuários simultâneos), ${config.durationSeconds} s por fase`,
    `- **Resultado:** ${passed ? "aprovado" : "reprovado"}`,
    "",
    "## Fases",
    "",
    "| Fase | Usuários | Requisições | Req/s | p50 (ms) | p95 (ms) | p99 (ms) | Erros |",
    "|---|---|---|---|---|---|---|---|",
    phaseRow("Tráfego médio (1x)", baseline),
    phaseRow(`Carga (${config.multiplier}x)`, load),
    "",
    "## Limites",
    "",
    "| Limite | Valor | Medido na carga |",
    "|---|---|---|",
    `| p95 | até ${limits.p95Ms} ms | ${load.p95Ms} ms |`,
    `| p99 | até ${limits.p99Ms} ms | ${load.p99Ms} ms |`,
    `| Taxa de erro | até ${formatPercent(limits.maxErrorRate)} | ${formatPercent(load.errorRate)} |`,
    `| Degradação do p95 (carga / tráfego médio) | até ${limits.maxP95Degradation}x | ${p95Degradation(baseline, load).toFixed(2).replace(".", ",")}x |`,
    "",
    "## Carga por rota",
    "",
    "| Rota | Requisições | p50 (ms) | p95 (ms) | p99 (ms) | Erros |",
    "|---|---|---|---|---|---|",
    ...load.byPath.map(
      (item) =>
        `| \`${item.path}\` | ${item.requests} | ${item.p50Ms} | ${item.p95Ms} | ${item.p99Ms} | ${item.errors} (${formatPercent(item.errorRate)}) |`
    ),
    "",
  ]
  if (!passed) {
    lines.push("## Limites violados", "", ...violations.map((v) => `- ${v}`))
    lines.push("")
  }
  return lines.join("\n")
}

/**
 * Builds the settings from performance-budget.json and the command
 * line: `[baseUrl] --users N --multiplier N --duration S --think MS
 * --out file.md`.
 *
 * @param args - Command line arguments.
 * @returns The load test settings.
 */
export function parseOptions(args: string[]): LoadConfig {
  const defaults = budget.loadTest
  const { values, positionals } = parseArgs({
    args,
    allowPositionals: true,
    options: {
      users: { type: "string" },
      multiplier: { type: "string" },
      duration: { type: "string" },
      think: { type: "string" },
      out: { type: "string" },
    },
  })
  const number = (value: string | undefined, fallback: number) => {
    if (value === undefined) return fallback
    const parsed = Number(value)
    if (!Number.isFinite(parsed) || parsed < 0)
      throw new Error(`invalid number: ${value}`)
    return parsed
  }
  return {
    baseUrl: (positionals[0] ?? "http://localhost:3000").replace(/\/$/, ""),
    baselineUsers: Math.max(
      1,
      Math.round(number(values.users, defaults.baselineUsers))
    ),
    multiplier: number(values.multiplier, defaults.multiplier),
    durationSeconds: number(values.duration, defaults.durationSeconds),
    thinkTimeMs: number(values.think, defaults.thinkTimeMs),
    timeoutMs: defaults.timeoutMs,
    limits: defaults.limits,
    paths: defaults.paths,
    out: values.out ?? "",
  }
}

/**
 * Load test of the storefront (RNF02, #79). Warms the caches, runs the
 * average traffic (baseline) and then `multiplier` times that traffic
 * over home, category, product and search pages, and fails when the
 * load phase breaks a limit of performance-budget.json. Needs the app
 * with its database and seed, so it runs on the local server, not in
 * CI: `npm run perf:load -- https://<server-ip> --out report.md`.
 *
 * @param args - Command line arguments (see `parseOptions`).
 * @returns Process exit code.
 */
export async function main(args: string[]): Promise<number> {
  const config = parseOptions(args)
  const phase = async (users: number) => {
    const samples = await runPhase({
      baseUrl: config.baseUrl,
      paths: config.paths,
      users,
      durationMs: config.durationSeconds * 1000,
      thinkTimeMs: config.thinkTimeMs,
      timeoutMs: config.timeoutMs,
    })
    return summarizePhase(samples, users, config.durationSeconds)
  }
  // Warm up the caches once, as a returning visitor would find them
  for (const { path } of config.paths) {
    await fetch(`${config.baseUrl}${path}`, {
      signal: AbortSignal.timeout(config.timeoutMs),
    })
      .then((response) => response.arrayBuffer())
      .catch(() => undefined)
  }
  process.stdout.write(`baseline: ${config.baselineUsers} users...\n`)
  const baseline = await phase(config.baselineUsers)
  const loadUsers = Math.round(config.baselineUsers * config.multiplier)
  process.stdout.write(`load: ${loadUsers} users...\n`)
  const load = await phase(loadUsers)
  const violations = evaluateLoad(baseline, load, config.limits)
  const report = renderReport({
    config,
    baseline,
    load,
    violations,
    date: new Date(),
  })
  process.stdout.write(`\n${report}`)
  if (config.out) {
    mkdirSync(dirname(config.out), { recursive: true })
    writeFileSync(config.out, report)
  }
  return violations.length === 0 ? 0 : 1
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main(process.argv.slice(2)).then((code) => process.exit(code))
}
