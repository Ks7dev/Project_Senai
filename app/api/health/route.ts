import { NextResponse } from "next/server"
import { checkHealth } from "@/features/shared/lib/db/health"

/** Always evaluated on request: the answer reflects the live database. */
export const dynamic = "force-dynamic"

/**
 * Readiness check used by the Docker healthcheck and by the uptime
 * monitor (#80). Probes the database with `SELECT 1` and returns no
 * internal detail: 200 `{ status: "ok" }` or 503
 * `{ status: "unavailable" }`.
 *
 * @returns The health status as JSON, never cached.
 */
export async function GET() {
  const health = await checkHealth()
  return NextResponse.json(health, {
    status: health.status === "ok" ? 200 : 503,
    headers: { "Cache-Control": "no-store" },
  })
}
