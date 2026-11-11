/** Rate limit rule: at most `limit` requests per `windowMs`. */
export type RateLimitRule = {
  /** Maximum number of requests in the window. */
  limit: number
  /** Window size in milliseconds. */
  windowMs: number
}

/** Outcome of a rate limit check. */
export type RateLimitResult = {
  /** Whether the request may go through. */
  allowed: boolean
  /** Requests left in the current window. */
  remaining: number
  /** Seconds until the window frees a slot (0 when allowed). */
  retryAfterSeconds: number
}

/**
 * In-memory sliding window rate limiter. The app runs as a single
 * container on the local server (ARCHITECTURE.md 5.1), so process
 * memory is enough; a shared store would be needed with replicas.
 */
export class RateLimiter {
  private readonly hits = new Map<string, number[]>()

  /**
   * Creates a limiter.
   *
   * @param now - Clock function, replaceable in tests.
   */
  constructor(private readonly now: () => number = Date.now) {}

  /**
   * Registers a request for `key` and tells whether it is allowed.
   *
   * @param key - Who is being limited (route group + client IP).
   * @param rule - Limit and window.
   * @returns Whether it is allowed, remaining slots and retry delay.
   */
  check(key: string, rule: RateLimitRule): RateLimitResult {
    const now = this.now()
    const windowStart = now - rule.windowMs
    const recent = (this.hits.get(key) ?? []).filter((t) => t > windowStart)

    if (recent.length >= rule.limit) {
      this.hits.set(key, recent)
      const retryAfterMs = recent[0] + rule.windowMs - now
      return {
        allowed: false,
        remaining: 0,
        retryAfterSeconds: Math.max(1, Math.ceil(retryAfterMs / 1000)),
      }
    }

    recent.push(now)
    this.hits.set(key, recent)
    if (this.hits.size > 10_000) this.prune(windowStart)
    return {
      allowed: true,
      remaining: rule.limit - recent.length,
      retryAfterSeconds: 0,
    }
  }

  /**
   * Drops keys with no request inside the window, to bound memory.
   *
   * @param windowStart - Oldest timestamp still relevant.
   */
  private prune(windowStart: number) {
    for (const [key, times] of this.hits) {
      if (times.every((t) => t <= windowStart)) this.hits.delete(key)
    }
  }
}

/** Rate limited route groups, matched by path prefix (RNF05). */
export const RATE_LIMIT_RULES: Array<{
  /** Group name used in the limiter key and logs. */
  name: string
  /** Path prefixes covered by the rule. */
  paths: string[]
  /** Only these HTTP methods are limited. */
  methods: string[]
  /** Limit and window. */
  rule: RateLimitRule
}> = [
  {
    name: "auth",
    paths: ["/entrar", "/cadastro", "/recuperar-senha", "/redefinir-senha"],
    methods: ["POST"],
    rule: { limit: 10, windowMs: 60_000 },
  },
  {
    name: "api",
    paths: ["/api/"],
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
    rule: { limit: 120, windowMs: 60_000 },
  },
]

/**
 * Finds the rate limit rule that applies to a request.
 *
 * @param pathname - Request path.
 * @param method - HTTP method.
 * @returns The matching rule group, or `undefined` when not limited.
 */
export function findRateLimitRule(pathname: string, method: string) {
  return RATE_LIMIT_RULES.find(
    (group) =>
      group.methods.includes(method) &&
      group.paths.some((path) => pathname === path || pathname.startsWith(path))
  )
}
