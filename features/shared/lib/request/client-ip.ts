import "server-only"
import { headers } from "next/headers"
import { unstable_rethrow } from "next/navigation"

/** Longest value stored for an IP (the audit column is VARCHAR(64)). */
const MAX_IP_LENGTH = 64

/**
 * Extracts the client IP from the request headers. Caddy replaces the
 * `X-Forwarded-For` sent by the client with the real address (no
 * trusted proxies are configured), so its first entry is the client.
 * Anything that does not look like an IPv4 or IPv6 address is dropped,
 * so a forged header never reaches the log as free text.
 *
 * @param requestHeaders - Headers of the current request.
 * @returns The IP, or null when unknown.
 */
export function clientIpFromHeaders(requestHeaders: Headers): string | null {
  const forwarded = requestHeaders.get("x-forwarded-for")?.split(",")[0]
  const candidate = (forwarded ?? requestHeaders.get("x-real-ip") ?? "").trim()
  if (
    !candidate ||
    candidate.length > MAX_IP_LENGTH ||
    !/^[0-9a-fA-F:.]+$/.test(candidate)
  ) {
    return null
  }
  return candidate
}

/**
 * IP of the client of the current request, for the audit log (RNF12).
 *
 * @returns The IP, or null outside a request (scheduled jobs) or when
 * the proxy did not send it.
 */
export async function getClientIp(): Promise<string | null> {
  try {
    return clientIpFromHeaders(await headers())
  } catch (error) {
    unstable_rethrow(error)
    return null
  }
}
