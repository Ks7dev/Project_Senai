import { logger } from "@/features/shared/lib/logger/logger"
import {
  MercadoPagoError,
  mercadoPagoWebhookSecret,
  verifyWebhookSignature,
} from "@/features/shared/lib/mercadopago/mercadopago"
import { processPaymentNotification } from "@/features/shared/lib/payments/payment-reconciliation"

/** Largest notification body accepted, in bytes. */
const MAX_BODY_BYTES = 16_384

/**
 * JSON answer without any internal detail (RNF05).
 *
 * @param status - HTTP status.
 * @param body - Small JSON body.
 * @returns The response.
 */
function reply(status: number, body: Record<string, unknown>): Response {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  })
}

/**
 * Mercado Pago webhook (RF30, RN13, #57). The only route the tunnel
 * exposes to the internet. It:
 * 1. refuses calls without a valid `x-signature` (HMAC of `data.id`,
 *    `x-request-id` and `ts` with the webhook secret);
 * 2. ignores topics other than payments;
 * 3. processes the payment idempotently by the `x-request-id`, reading
 *    it again from `GET /v1/payments/{id}`; the order is confirmed only
 *    with "approved".
 * A processing failure answers 500, so Mercado Pago delivers it again;
 * the reconciliation job covers notifications that never arrive.
 *
 * @param request - Notification from Mercado Pago.
 * @returns 200 when handled (or ignored), 401 for an invalid signature.
 */
export async function POST(request: Request): Promise<Response> {
  const secret = mercadoPagoWebhookSecret()
  if (!secret) {
    logger.error("mercadopago webhook secret not configured")
    return reply(503, { ok: false })
  }

  const text = await request.text()
  if (text.length > MAX_BODY_BYTES) return reply(413, { ok: false })
  let body: { type?: unknown; data?: { id?: unknown } } = {}
  try {
    body = text ? JSON.parse(text) : {}
  } catch {
    return reply(400, { ok: false })
  }

  const url = new URL(request.url)
  const dataId =
    url.searchParams.get("data.id") ??
    (typeof body.data?.id === "string" || typeof body.data?.id === "number"
      ? String(body.data.id)
      : null)
  const topic =
    url.searchParams.get("type") ??
    (typeof body.type === "string" ? body.type : "")
  const requestId = request.headers.get("x-request-id")

  if (
    !verifyWebhookSignature({
      signature: request.headers.get("x-signature"),
      requestId,
      dataId,
      secret,
    })
  ) {
    logger.warn("mercadopago webhook with invalid signature")
    return reply(401, { ok: false })
  }
  if (topic !== "payment" || !dataId || !requestId) {
    return reply(200, { ok: true, ignored: true })
  }

  try {
    const result = await processPaymentNotification({
      requestId: requestId.slice(0, 128),
      topic,
      resourceId: dataId,
    })
    return reply(200, { ok: true, status: result.status })
  } catch (error) {
    if (error instanceof MercadoPagoError && error.kind === "not_found") {
      // Not a payment of this account: nothing to retry
      return reply(200, { ok: true, ignored: true })
    }
    logger.error("mercadopago webhook failed", {
      error: error instanceof Error ? error.name : "unknown",
    })
    return reply(500, { ok: false })
  }
}
