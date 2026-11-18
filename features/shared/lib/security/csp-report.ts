/** Largest CSP report body accepted, in bytes and characters (#173). */
export const CSP_REPORT_MAX_LENGTH = 16_384

/** Most violations logged from a single report request. */
const MAX_VIOLATIONS = 10

/** CSP violation reduced to fields without personal data (#173). */
export type CspViolation = {
  /** Directive that blocked the resource, e.g. `script-src-elem`. */
  directive: string
  /** Origin of the blocked resource, or `inline`, `eval` and the like. */
  blocked: string
  /** Path of the page, without query string. */
  page: string
  /** `enforce` or `report`. */
  disposition: string
}

type RawReport = Record<string, unknown>

/**
 * Reads a string field.
 *
 * @param report - Raw report.
 * @param keys - Candidate field names, in order.
 * @returns The first string value found, or "".
 */
function field(report: RawReport, ...keys: string[]): string {
  for (const key of keys) {
    const value = report[key]
    if (typeof value === "string") return value
  }
  return ""
}

/**
 * Keeps only the origin of a blocked URL; keywords such as `inline` or
 * `eval` are kept as they are. Query strings and paths may carry
 * personal data and are never logged.
 *
 * @param value - Blocked URL or keyword.
 * @returns The safe value.
 */
function safeBlocked(value: string): string {
  try {
    return new URL(value).origin
  } catch {
    return /^[a-z-]{1,32}$/.test(value) ? value : "unknown"
  }
}

/**
 * Keeps only the path of the page that raised the violation.
 *
 * @param value - Document URL.
 * @returns The path, with ids masked.
 */
function safePage(value: string): string {
  try {
    return new URL(value).pathname.replace(
      /^\/conta\/pedidos\/[^/]+/,
      "/conta/pedidos/[id]"
    )
  } catch {
    return "unknown"
  }
}

/**
 * Reduces one raw report to the logged fields.
 *
 * @param report - Raw report, legacy (`report-uri`) or Reporting API.
 * @returns The violation.
 */
function toViolation(report: RawReport): CspViolation {
  return {
    directive: field(
      report,
      "effectiveDirective",
      "effective-directive",
      "violated-directive"
    ).slice(0, 64),
    blocked: safeBlocked(field(report, "blockedURL", "blocked-uri")),
    page: safePage(field(report, "documentURL", "document-uri")),
    disposition: field(report, "disposition") || "enforce",
  }
}

/**
 * Parses the body of a CSP violation report: the legacy
 * `application/csp-report` format (`{ "csp-report": {...} }`) or the
 * Reporting API `application/reports+json` format (an array of
 * `{ type: "csp-violation", body: {...} }`).
 *
 * @param body - Raw request body.
 * @returns The violations, or an empty list when the body is invalid.
 */
export function parseCspReport(body: string): CspViolation[] {
  if (body.length === 0 || body.length > CSP_REPORT_MAX_LENGTH) return []
  let data: unknown
  try {
    data = JSON.parse(body)
  } catch {
    return []
  }
  const reports: RawReport[] = []
  if (Array.isArray(data)) {
    for (const item of data) {
      if (
        item &&
        typeof item === "object" &&
        item.type === "csp-violation" &&
        item.body &&
        typeof item.body === "object"
      ) {
        reports.push(item.body as RawReport)
      }
    }
  } else if (data && typeof data === "object") {
    const legacy = (data as RawReport)["csp-report"]
    if (legacy && typeof legacy === "object") reports.push(legacy as RawReport)
  }
  return reports.slice(0, MAX_VIOLATIONS).map(toViolation)
}
