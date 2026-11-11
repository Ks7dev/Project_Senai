/** Log severity levels, from the most to the least verbose. */
export type LogLevel = "debug" | "info" | "warn" | "error"

/** Extra structured fields attached to a log entry. */
export type LogFields = Record<string, unknown>

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
}

/**
 * Keys whose values never reach the logs (RNF05, LGPD): credentials,
 * documents, payment data and HTTP headers.
 */
const SENSITIVE_KEY =
  /pass(word)?|secret|token|authorization|cookie|cpf|cnpj|card|cvv|document|phone|telefone|e-?mail|headers?/i

const REDACTED = "[redacted]"

/**
 * Masks sensitive values in a log payload, recursively.
 *
 * @param value - Any value to be logged.
 * @param depth - Current recursion depth, to stop on deep objects.
 * @returns A copy safe to write to the logs.
 */
export function redact(value: unknown, depth = 0): unknown {
  if (depth > 5) return "[truncated]"
  if (Array.isArray(value)) return value.map((item) => redact(item, depth + 1))
  if (value instanceof Error) {
    return { name: value.name, message: value.message }
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        SENSITIVE_KEY.test(key) ? REDACTED : redact(item, depth + 1),
      ])
    )
  }
  return value
}

/**
 * Minimum level written to the output, from `LOG_LEVEL` (default
 * `info`, or `warn` during tests).
 *
 * @returns The configured level.
 */
function minLevel(): LogLevel {
  const fromEnv = process.env.LOG_LEVEL as LogLevel | undefined
  if (fromEnv && fromEnv in LEVEL_ORDER) return fromEnv
  return process.env.NODE_ENV === "test" ? "warn" : "info"
}

/**
 * Writes one structured JSON log line with timestamp, level, message,
 * request id (when known) and the redacted fields.
 *
 * @param level - Severity.
 * @param message - Short description of the event, in English.
 * @param fields - Extra context; sensitive keys are masked.
 */
export function log(level: LogLevel, message: string, fields: LogFields = {}) {
  if (LEVEL_ORDER[level] < LEVEL_ORDER[minLevel()]) return
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    ...(redact(fields) as LogFields),
  }
  const line = JSON.stringify(entry)
  if (level === "error" || level === "warn") console.error(line)
  else console.info(line)
}

/** Structured logger used by actions, integrations and the proxy. */
export const logger = {
  /**
   * Logs a debug entry.
   *
   * @param message - Event description.
   * @param fields - Extra context.
   */
  debug: (message: string, fields?: LogFields) => log("debug", message, fields),
  /**
   * Logs an info entry.
   *
   * @param message - Event description.
   * @param fields - Extra context.
   */
  info: (message: string, fields?: LogFields) => log("info", message, fields),
  /**
   * Logs a warning entry.
   *
   * @param message - Event description.
   * @param fields - Extra context.
   */
  warn: (message: string, fields?: LogFields) => log("warn", message, fields),
  /**
   * Logs an error entry.
   *
   * @param message - Event description.
   * @param fields - Extra context.
   */
  error: (message: string, fields?: LogFields) => log("error", message, fields),
}
