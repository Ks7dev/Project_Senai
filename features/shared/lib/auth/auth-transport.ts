import { logger } from "@/features/shared/lib/logger/logger"

/** Environment values that decide how the session cookie travels. */
export type AuthTransportEnv = {
  /** `NODE_ENV` of the process. */
  nodeEnv?: string
  /** `BETTER_AUTH_URL`, base of the links sent by e-mail. */
  baseUrl?: string
}

/**
 * Whether the session cookies must carry `Secure` and the `__Secure-`
 * prefix (SEC-001, #220). In production they always do, whatever the
 * scheme of `BETTER_AUTH_URL`, so the browser never sends the session
 * over plain HTTP, even when the site is opened by IP (HSTS does not
 * cover IP hosts). In development the plain `http://localhost` works.
 *
 * @param env - Process environment values.
 * @returns True in production.
 */
export function shouldUseSecureCookies(env: AuthTransportEnv): boolean {
  return env.nodeEnv === "production"
}

/**
 * Checks at startup that, in production, `BETTER_AUTH_URL` uses https
 * (SEC-001, #220): reset and invitation links are built from it and
 * would carry their token in clear. Only logs an error, so a wrong
 * value never takes the store down.
 *
 * @param env - Process environment values.
 * @returns True when the URL is fine for the environment.
 */
export function checkAuthBaseUrl(env: AuthTransportEnv): boolean {
  if (env.nodeEnv !== "production") return true
  if (env.baseUrl?.startsWith("https://")) return true
  logger.error("BETTER_AUTH_URL must use https in production", {
    scheme: env.baseUrl ? env.baseUrl.split(":")[0] : "missing",
  })
  return false
}
