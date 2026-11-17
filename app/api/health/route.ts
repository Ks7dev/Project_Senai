import { connection, NextResponse } from "next/server"
import { checkHealth } from "@/features/shared/lib/db/health"

/**
 * Readiness check used by the Docker healthcheck and by the uptime
 * monitor (#80). Probes the database with `SELECT 1` and returns no
 * internal detail: 200 `{ status: "ok" }` or 503
 * `{ status: "unavailable" }`.
 *
 * @returns The health status as JSON, never cached.
 */
export async function GET() {
  // Evaluated on every request: the answer reflects the live database
  await connection()
  const health = await checkHealth()
  return NextResponse.json(health, {
    status: health.status === "ok" ? 200 : 503,
    headers: { "Cache-Control": "no-store" },
  })
}
