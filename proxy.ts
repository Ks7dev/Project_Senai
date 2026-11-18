import { NextResponse, type NextRequest } from "next/server"
import { logger } from "@/features/shared/lib/logger/logger"
import { findRateLimitRule } from "@/features/shared/lib/rate-limit/rate-limit"
import { checkSharedRateLimit } from "@/features/shared/lib/rate-limit/shared-limit"
import { REQUEST_ID_HEADER } from "@/features/shared/lib/request/request-id-header"
import {
  buildPaymentContentSecurityPolicy,
  createNonce,
  isPaymentPagePath,
  NONCE_HEADER,
  reportingEndpoints,
} from "@/features/shared/lib/security/headers"

const isDev = process.env.NODE_ENV !== "production"

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
 * correlation, applies rate limiting to auth forms and APIs (RNF05),
 * shared by every worker of the app cluster (#79),
 * and sets the CSP with a per request nonce on the payment page (#173).
 *
 * @param request - Incoming request.
 * @returns The response, or 429 when the client exceeded the limit.
 */
export async function proxy(request: NextRequest) {
  // Always generated here: a client-sent id is never trusted in logs
  const requestId = crypto.randomUUID()
  const { pathname } = request.nextUrl

  const group = findRateLimitRule(pathname, request.method)
  if (group) {
    const ip = clientIp(request)
    const result = await checkSharedRateLimit(`${group.name}:${ip}`, group.rule)
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
  // A client-sent nonce is never trusted
  requestHeaders.delete(NONCE_HEADER)

  let csp: string | null = null
  if (isPaymentPagePath(pathname)) {
    const nonce = createNonce()
    csp = buildPaymentContentSecurityPolicy(isDev, nonce)
    // Next.js reads the nonce from the request CSP and applies it to
    // its own scripts; the page reads it from x-nonce for <Script>
    requestHeaders.set(NONCE_HEADER, nonce)
    requestHeaders.set("Content-Security-Policy", csp)
  }

  const response = NextResponse.next({ request: { headers: requestHeaders } })
  response.headers.set(REQUEST_ID_HEADER, requestId)
  if (csp) {
    response.headers.set("Content-Security-Policy", csp)
    response.headers.set("Reporting-Endpoints", reportingEndpoints())
  }
  return response
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
}
