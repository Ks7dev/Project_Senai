import { NextResponse, type NextRequest } from "next/server"
import { logger } from "@/features/shared/lib/logger/logger"
import {
  findRateLimitRule,
  RateLimiter,
} from "@/features/shared/lib/rate-limit/rate-limit"
import { REQUEST_ID_HEADER } from "@/features/shared/lib/request/request-id-header"

const limiter = new RateLimiter()

/**
 * Client IP as seen by the app. The Caddy proxy sets
 * `X-Forwarded-For`; only its first hop is trusted.
 *
 * @param request - Incoming request.
 * @returns The client IP or "unknown".
 */
function clientIp(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for")
  return forwarded?.split(",")[0]?.trim() || "unknown"
}

/**
 * Runs before every request: assigns a request id for log
 * correlation and applies rate limiting to auth forms and APIs
 * (RNF05).
 *
 * @param request - Incoming request.
 * @returns The response, or 429 when the client exceeded the limit.
 */
export function proxy(request: NextRequest) {
  // Always generated here: a client-sent id is never trusted in logs
  const requestId = crypto.randomUUID()
  const { pathname } = request.nextUrl

  const group = findRateLimitRule(pathname, request.method)
  if (group) {
    const ip = clientIp(request)
    const result = limiter.check(`${group.name}:${ip}`, group.rule)
    if (!result.allowed) {
      logger.warn("rate limit exceeded", {
        requestId,
        group: group.name,
        path: pathname,
        method: request.method,
      })
      return NextResponse.json(
        {
          success: false,
          error:
            "Muitas tentativas em pouco tempo. Aguarde um instante e tente novamente.",
        },
        {
          status: 429,
          headers: {
            "Retry-After": String(result.retryAfterSeconds),
            [REQUEST_ID_HEADER]: requestId,
          },
        }
      )
    }
  }

  const requestHeaders = new Headers(request.headers)
  requestHeaders.set(REQUEST_ID_HEADER, requestId)
  const response = NextResponse.next({ request: { headers: requestHeaders } })
  response.headers.set(REQUEST_ID_HEADER, requestId)
  return response
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
}
