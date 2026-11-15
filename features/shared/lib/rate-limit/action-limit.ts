import "server-only"
import { headers } from "next/headers"
import { AppError } from "@/features/shared/lib/errors/action-result"
import { logger } from "@/features/shared/lib/logger/logger"
import {
  RateLimiter,
  type RateLimitRule,
} from "@/features/shared/lib/rate-limit/rate-limit"

const limiter = new RateLimiter()

/** Message shown when a public action is called too often (RNF05). */
export const TOO_MANY_REQUESTS_MESSAGE =
  "Muitas consultas em pouco tempo. Aguarde um instante e tente novamente."

/**
 * Rate limits a public Server Action that calls an external service
 * (ViaCEP, shipping APIs), keyed by the client IP set by the Caddy
 * proxy. Server Actions post to the page URL, so the proxy limiter
 * does not cover them.
 *
 * @param name - Action group, e.g. "cep".
 * @param rule - Limit and window.
 * @throws AppError when the client exceeded the limit.
 */
export async function enforceActionRateLimit(
  name: string,
  rule: RateLimitRule
): Promise<void> {
  const requestHeaders = await headers()
  const forwarded = requestHeaders.get("x-forwarded-for")
  const ip = forwarded?.split(",")[0]?.trim() || "unknown"
  const result = limiter.check(`action:${name}:${ip}`, rule)
  if (!result.allowed) {
    logger.warn("action rate limit exceeded", { group: name })
    throw new AppError(TOO_MANY_REQUESTS_MESSAGE, "rate_limited")
  }
}
