import { NextResponse } from "next/server"

/**
 * Liveness check used by the Docker healthcheck and by monitoring
 * (#80). Returns no internal detail.
 *
 * @returns `{ status: "ok" }`.
 */
export function GET() {
  return NextResponse.json({ status: "ok" })
}
