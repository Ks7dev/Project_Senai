import "server-only"
import { prisma } from "@/features/shared/lib/db/prisma"
import { logger } from "@/features/shared/lib/logger/logger"

/** Longest wait for the database answer before it counts as down. */
const DATABASE_TIMEOUT_MS = 3000

/** Result of the readiness check, without any internal detail. */
export type HealthStatus = {
  /** "ok" when the app and the database answer. */
  status: "ok" | "unavailable"
  /** Database state. */
  database: "up" | "down"
}

/**
 * Runs `SELECT 1` against MySQL with a timeout. Used by the
 * `/api/health` route, the Docker healthcheck and the uptime monitor
 * (#80). The error is logged without the connection details and never
 * returned to the caller (RNF05).
 *
 * @param query - Runs the probe query; defaults to the shared Prisma
 *   client (injectable for tests).
 * @param timeoutMs - Longest wait, in milliseconds.
 * @returns The health status.
 */
export async function checkHealth(
  query: () => Promise<unknown> = () => prisma.$queryRaw`SELECT 1`,
  timeoutMs = DATABASE_TIMEOUT_MS
): Promise<HealthStatus> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    await Promise.race([
      query(),
      new Promise((_, reject) => {
        timer = setTimeout(
          () => reject(new Error("database health check timed out")),
          timeoutMs
        )
      }),
    ])
    return { status: "ok", database: "up" }
  } catch (error) {
    logger.error("health check failed", {
      reason: error instanceof Error ? error.name : "unknown",
    })
    return { status: "unavailable", database: "down" }
  } finally {
    if (timer) clearTimeout(timer)
  }
}
