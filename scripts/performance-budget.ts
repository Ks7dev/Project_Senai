import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { pathToFileURL } from "node:url"
import { gzipSync } from "node:zlib"
import budget from "../performance-budget.json" with { type: "json" }

/** Budget of one storefront route (first load, gzip). */
export type RouteBudget = {
  /** App Router entry, e.g. "/(store)/produto/[slug]/page". */
  route: string
  /** Maximum JavaScript downloaded on first load, in KB (gzip). */
  maxJsKb: number
  /** Maximum CSS downloaded on first load, in KB (gzip). */
  maxCssKb: number
}

/** Measured first-load size of a route. */
export type RouteSize = { route: string; jsKb: number; cssKb: number }

/** Shape of the client reference manifest written by `next build`. */
type ClientManifest = {
  entryJSFiles?: Record<string, string[]>
  entryCSSFiles?: Record<string, Array<string | { path: string }>>
}

/**
 * Reads the client reference manifest of a route from the build
 * output. The file assigns the manifest to a global, so it is
 * evaluated with a local stand-in for `globalThis`.
 *
 * @param nextDir - The `.next` folder.
 * @param route - App Router entry.
 * @returns The manifest.
 */
export function readClientManifest(
  nextDir: string,
  route: string
): ClientManifest {
  const file = join(
    nextDir,
    "server",
    "app",
    `${route}_client-reference-manifest.js`
  )
  const source = readFileSync(file, "utf8")
  const scope: { __RSC_MANIFEST?: Record<string, ClientManifest> } = {}
  new Function("globalThis", source)(scope)
  const manifest = scope.__RSC_MANIFEST?.[route]
  if (!manifest) throw new Error(`manifest of ${route} not found`)
  return manifest
}

/**
 * Files a browser downloads on the first visit of a route: the root
 * runtime chunks plus the chunks and stylesheets of every layout and
 * page of the route.
 *
 * @param nextDir - The `.next` folder.
 * @param route - App Router entry.
 * @returns JavaScript and CSS paths relative to `.next`.
 */
export function firstLoadFiles(
  nextDir: string,
  route: string
): { js: string[]; css: string[] } {
  const buildManifest = JSON.parse(
    readFileSync(
      join(nextDir, "server", "app", route, "build-manifest.json"),
      "utf8"
    )
  ) as { rootMainFiles?: string[]; polyfillFiles?: string[] }
  const manifest = readClientManifest(nextDir, route)
  const js = new Set<string>(buildManifest.rootMainFiles ?? [])
  for (const [entry, files] of Object.entries(manifest.entryJSFiles ?? {})) {
    if (entry.endsWith("/global-error")) continue
    for (const file of files) js.add(file)
  }
  const css = new Set<string>()
  for (const files of Object.values(manifest.entryCSSFiles ?? {})) {
    for (const file of files) {
      css.add(typeof file === "string" ? file : file.path)
    }
  }
  return { js: [...js], css: [...css] }
}

/**
 * Gzip size of files in KB, one decimal.
 *
 * @param nextDir - The `.next` folder.
 * @param files - Paths relative to `.next`.
 * @returns The size in KB.
 */
function gzipKb(nextDir: string, files: string[]): number {
  let bytes = 0
  for (const file of files) {
    const path = join(nextDir, file.replace(/^\/?_next\//, ""))
    if (existsSync(path)) bytes += gzipSync(readFileSync(path)).length
  }
  return Math.round((bytes / 1024) * 10) / 10
}

/**
 * Compares measured sizes with the budget.
 *
 * @param sizes - Measured sizes per route.
 * @param budgets - Budget per route.
 * @returns One message per route over the budget (empty when all pass).
 */
export function findBudgetViolations(
  sizes: RouteSize[],
  budgets: RouteBudget[]
): string[] {
  const violations: string[] = []
  for (const limit of budgets) {
    const size = sizes.find((item) => item.route === limit.route)
    if (!size) {
      violations.push(`${limit.route}: route not found in the build`)
      continue
    }
    if (size.jsKb > limit.maxJsKb) {
      violations.push(
        `${limit.route}: JS ${size.jsKb} KB > ${limit.maxJsKb} KB (gzip)`
      )
    }
    if (size.cssKb > limit.maxCssKb) {
      violations.push(
        `${limit.route}: CSS ${size.cssKb} KB > ${limit.maxCssKb} KB (gzip)`
      )
    }
  }
  return violations
}

/**
 * Measures the first-load JavaScript and CSS of the storefront routes
 * after `next build` and fails when a route exceeds the budget in
 * performance-budget.json (RNF10, #78). Run with `npm run perf:budget`.
 *
 * @param nextDir - The `.next` folder.
 * @returns Process exit code.
 */
export function main(nextDir = ".next"): number {
  const budgets = budget.routes as RouteBudget[]
  const sizes: RouteSize[] = []
  for (const { route } of budgets) {
    try {
      const files = firstLoadFiles(nextDir, route)
      sizes.push({
        route,
        jsKb: gzipKb(nextDir, files.js),
        cssKb: gzipKb(nextDir, files.css),
      })
    } catch {
      // Reported as "route not found" below
    }
  }
  for (const size of sizes) {
    process.stdout.write(
      `${size.route}: JS ${size.jsKb} KB, CSS ${size.cssKb} KB (gzip)\n`
    )
  }
  const violations = findBudgetViolations(sizes, budgets)
  for (const violation of violations) {
    process.stderr.write(`Over budget: ${violation}\n`)
  }
  return violations.length > 0 ? 1 : 0
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  process.exit(main())
}
