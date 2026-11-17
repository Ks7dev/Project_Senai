import { logger } from "@/features/shared/lib/logger/logger"
import {
  CSP_REPORT_MAX_LENGTH,
  parseCspReport,
} from "@/features/shared/lib/security/csp-report"

/**
 * Receives the CSP violation reports the browser sends from the payment
 * page (#173, PCI 11.6.1) and only writes them to the log, without
 * personal data, so an unexpected script is detected and alerted. Never
 * touches the database.
 *
 * @param request - Report sent by the browser.
 * @returns 204 in every case.
 */
export async function POST(request: Request) {
  const length = Number(request.headers.get("content-length") ?? "0")
  if (length <= CSP_REPORT_MAX_LENGTH) {
    const body = await request.text()
    for (const violation of parseCspReport(body)) {
      logger.warn("csp violation", violation)
    }
  }
  return new Response(null, { status: 204 })
}
