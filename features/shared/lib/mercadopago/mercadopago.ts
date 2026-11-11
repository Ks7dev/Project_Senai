import "server-only"
import { createHmac, timingSafeEqual } from "node:crypto"
import { z } from "zod"
import { logger } from "@/features/shared/lib/logger/logger"

/** Mercado Pago settings, read from the environment (sandbox only). */
export type MercadoPagoConfig = {
  /** API base URL. */
  baseUrl: string
  /** Access token of the sandbox application (never sent to the browser). */
  accessToken: string
  /** Timeout of each request, in milliseconds. */
  timeoutMs: number
}

/** Payment statuses stored on the `payments` table. */
export type PaymentStatusKey =
  | "PENDING"
  | "APPROVED"
  | "REJECTED"
  | "CANCELED"
  | "EXPIRED"
  | "REFUNDED"
  | "PARTIALLY_REFUNDED"

/** A Mercado Pago payment, reduced to what the store uses. */
export type ProviderPayment = {
  /** Mercado Pago payment id (RF32). */
  id: string
  /** Raw status, e.g. "approved", "in_process". */
  status: string
  /** Raw status detail, e.g. "cc_rejected_other_reason". */
  statusDetail: string | null
  /** Charged amount as a decimal string with 2 places. */
  amount: string
  /** Currency, "BRL" for the store. */
  currency: string
  /** Our payment row id, sent as `external_reference`. */
  externalReference: string | null
  /** Payment method id, e.g. "visa", "pix", "bolbradesco". */
  paymentMethodId: string | null
  /** Card installments. */
  installments: number
  /** When it was approved, if it was. */
  approvedAt: Date | null
  /** Refunded amount as a decimal string. */
  refundedAmount: string
  /** 3DS challenge data, when the issuer asks for it (RF37). */
  threeDs: { externalResourceUrl: string; creq: string } | null
  /** Pix copy-and-paste code and QR Code image (RF29). */
  pix: { qrCode: string; qrCodeBase64: string | null } | null
  /** Boleto PDF link and digitable line (RF29). */
  boleto: { url: string | null; digitableLine: string | null } | null
}

/** Why a call to Mercado Pago did not produce a payment. */
export type MercadoPagoErrorKind =
  /** No access token in the environment. */
  | "not_configured"
  /** Mercado Pago answered with a 4xx: the request was refused. */
  | "refused"
  /** Timeout, network error or 5xx: the outcome is unknown. */
  | "unavailable"
  /** The payment does not exist. */
  | "not_found"

/** Failure of a Mercado Pago call; never carries the payload. */
export class MercadoPagoError extends Error {
  /**
   * Creates the error.
   *
   * @param kind - What went wrong.
   * @param status - HTTP status, when there was an answer.
   */
  constructor(
    public readonly kind: MercadoPagoErrorKind,
    public readonly status?: number
  ) {
    super(`Mercado Pago ${kind}${status ? ` (${status})` : ""}`)
    this.name = "MercadoPagoError"
  }
}

const DEFAULT_BASE_URL = "https://api.mercadopago.com"
const DEFAULT_TIMEOUT_MS = 10_000

/**
 * Mercado Pago settings from the environment. The access token is
 * server-only (no `NEXT_PUBLIC_`); without it online payment is off and
 * the customer sees a friendly message.
 *
 * @returns The settings, or null when the token is missing.
 */
export function mercadoPagoConfig(): MercadoPagoConfig | null {
  const accessToken = process.env.MERCADOPAGO_ACCESS_TOKEN?.trim() ?? ""
  if (!accessToken) return null
  const timeout = Number(process.env.MERCADOPAGO_TIMEOUT_MS)
  return {
    baseUrl: (process.env.MERCADOPAGO_BASE_URL || DEFAULT_BASE_URL).replace(
      /\/+$/,
      ""
    ),
    accessToken,
    timeoutMs:
      Number.isFinite(timeout) && timeout > 0 ? timeout : DEFAULT_TIMEOUT_MS,
  }
}

/**
 * Public key used by the Bricks in the browser (RF28, RF35). It is
 * public by design, read on the server and passed to the page.
 *
 * @returns The key, or null when missing.
 */
export function mercadoPagoPublicKey(): string | null {
  return process.env.MERCADOPAGO_PUBLIC_KEY?.trim() || null
}

/**
 * Public URL Mercado Pago calls with the payment notifications (the
 * tunnel address of `/api/webhooks/mercadopago`). Without it, the
 * account-level webhook configured in the Mercado Pago panel is used.
 *
 * @returns The URL, or null.
 */
export function mercadoPagoNotificationUrl(): string | null {
  const url = process.env.MERCADOPAGO_NOTIFICATION_URL?.trim() ?? ""
  return url.startsWith("https://") ? url : null
}

/**
 * Maps a Mercado Pago status to the stored payment status. Only
 * "approved" confirms a payment (RN13); "authorized", "in_process" and
 * "in_mediation" are still pending.
 *
 * @param status - Raw Mercado Pago status.
 * @param refundedAmount - Refunded amount, to tell a partial refund.
 * @param amount - Payment amount.
 * @returns The stored status.
 */
export function mapProviderStatus(
  status: string,
  refundedAmount = "0.00",
  amount = "0.00"
): PaymentStatusKey {
  switch (status) {
    case "approved":
      return Number(refundedAmount) > 0 ? "PARTIALLY_REFUNDED" : "APPROVED"
    case "rejected":
      return "REJECTED"
    case "cancelled":
      return "CANCELED"
    case "refunded":
    case "charged_back":
      return Number(refundedAmount) > 0 &&
        Number(refundedAmount) < Number(amount)
        ? "PARTIALLY_REFUNDED"
        : "REFUNDED"
    default:
      return "PENDING"
  }
}

const moneySchema = z
  .union([z.number(), z.string()])
  .transform((value) => Number(value))
  .pipe(z.number().finite().nonnegative())

const rawPaymentSchema = z.object({
  id: z.union([z.number(), z.string()]).transform(String),
  status: z.string().min(1),
  status_detail: z.string().nullish(),
  transaction_amount: moneySchema,
  transaction_amount_refunded: moneySchema.nullish(),
  currency_id: z.string().nullish(),
  external_reference: z.string().nullish(),
  payment_method_id: z.string().nullish(),
  installments: z.number().int().nullish(),
  date_approved: z.string().nullish(),
  three_ds_info: z
    .object({
      external_resource_url: z.string().nullish(),
      creq: z.string().nullish(),
    })
    .nullish(),
  point_of_interaction: z
    .object({
      transaction_data: z
        .object({
          qr_code: z.string().nullish(),
          qr_code_base64: z.string().nullish(),
        })
        .nullish(),
    })
    .nullish(),
  transaction_details: z
    .object({
      external_resource_url: z.string().nullish(),
      digitable_line: z.string().nullish(),
    })
    .nullish(),
  barcode: z.object({ content: z.string().nullish() }).nullish(),
})

/**
 * Reads the Mercado Pago payment answer into the store shape. Anything
 * else in the payload (payer, card holder) is dropped here.
 *
 * @param raw - JSON from `/v1/payments`.
 * @returns The payment.
 * @throws MercadoPagoError("unavailable") when the payload is unreadable.
 */
export function toProviderPayment(raw: unknown): ProviderPayment {
  const parsed = rawPaymentSchema.safeParse(raw)
  if (!parsed.success) {
    logger.warn("mercadopago returned an unexpected payload")
    throw new MercadoPagoError("unavailable")
  }
  const data = parsed.data
  const transactionData = data.point_of_interaction?.transaction_data
  const isTicket =
    !!data.transaction_details?.digitable_line ||
    !!data.barcode?.content ||
    (data.payment_method_id ?? "").startsWith("bol")
  const approvedAt = data.date_approved ? new Date(data.date_approved) : null
  return {
    id: data.id,
    status: data.status,
    statusDetail: data.status_detail ?? null,
    amount: data.transaction_amount.toFixed(2),
    currency: data.currency_id ?? "BRL",
    externalReference: data.external_reference ?? null,
    paymentMethodId: data.payment_method_id ?? null,
    installments: data.installments ?? 1,
    approvedAt:
      approvedAt && !Number.isNaN(approvedAt.getTime()) ? approvedAt : null,
    refundedAmount: (data.transaction_amount_refunded ?? 0).toFixed(2),
    threeDs:
      data.three_ds_info?.external_resource_url && data.three_ds_info.creq
        ? {
            externalResourceUrl: data.three_ds_info.external_resource_url,
            creq: data.three_ds_info.creq,
          }
        : null,
    pix: transactionData?.qr_code
      ? {
          qrCode: transactionData.qr_code,
          qrCodeBase64: transactionData.qr_code_base64 ?? null,
        }
      : null,
    boleto: isTicket
      ? {
          url: data.transaction_details?.external_resource_url ?? null,
          digitableLine:
            data.transaction_details?.digitable_line ??
            data.barcode?.content ??
            null,
        }
      : null,
  }
}

/**
 * Calls the Mercado Pago API with the timeout and the access token.
 * Logs carry only the operation and the HTTP status, never headers,
 * payload or personal data.
 *
 * @param operation - Short name for the logs.
 * @param path - API path.
 * @param init - Method, body and extra headers.
 * @param fetcher - Fetch implementation (replaced in tests).
 * @returns The parsed JSON.
 * @throws MercadoPagoError.
 */
async function callMercadoPago(
  operation: string,
  path: string,
  init: { method: "GET" | "POST"; body?: unknown; headers?: HeadersInit },
  fetcher: typeof fetch
): Promise<unknown> {
  const config = mercadoPagoConfig()
  if (!config) {
    logger.warn("mercadopago not configured", { operation })
    throw new MercadoPagoError("not_configured")
  }
  let response: Response
  try {
    response = await fetcher(`${config.baseUrl}${path}`, {
      method: init.method,
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.accessToken}`,
        ...init.headers,
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      signal: AbortSignal.timeout(config.timeoutMs),
      cache: "no-store",
    })
  } catch (error) {
    logger.warn("mercadopago unavailable", {
      operation,
      error: error instanceof Error ? error.name : "unknown",
    })
    throw new MercadoPagoError("unavailable")
  }
  if (response.status === 404) {
    logger.warn("mercadopago not found", { operation, status: 404 })
    throw new MercadoPagoError("not_found", 404)
  }
  if (!response.ok) {
    logger.warn("mercadopago request failed", {
      operation,
      status: response.status,
    })
    throw new MercadoPagoError(
      response.status >= 500 || response.status === 429
        ? "unavailable"
        : "refused",
      response.status
    )
  }
  try {
    return await response.json()
  } catch {
    logger.warn("mercadopago returned invalid json", { operation })
    throw new MercadoPagoError("unavailable")
  }
}

/** Body of `POST /v1/payments`, built by the server (RF36). */
export type CreatePaymentBody = {
  transaction_amount: number
  description: string
  payment_method_id: string
  external_reference: string
  payer: Record<string, unknown>
  token?: string
  installments?: number
  issuer_id?: string
  three_d_secure_mode?: "optional" | "not_supported"
  date_of_expiration?: string
  notification_url?: string
  statement_descriptor?: string
  metadata?: Record<string, string>
}

/**
 * Creates a payment in `/v1/payments` (RF36) with an idempotency key,
 * so a retry of the same attempt never charges twice.
 *
 * @param body - Payment body; the card is only the Brick token (RF35).
 * @param idempotencyKey - Our payment row id.
 * @param fetcher - Fetch implementation (replaced in tests).
 * @returns The created payment.
 * @throws MercadoPagoError.
 */
export async function createMercadoPagoPayment(
  body: CreatePaymentBody,
  idempotencyKey: string,
  fetcher: typeof fetch = fetch
): Promise<ProviderPayment> {
  const raw = await callMercadoPago(
    "create_payment",
    "/v1/payments",
    {
      method: "POST",
      body,
      headers: { "X-Idempotency-Key": idempotencyKey },
    },
    fetcher
  )
  return toProviderPayment(raw)
}

/**
 * Secret of the webhook signature, from the Mercado Pago panel
 * ("Your integrations" → Webhooks). Without it, notifications are
 * refused and the reconciliation keeps the payments up to date.
 *
 * @returns The secret, or null.
 */
export function mercadoPagoWebhookSecret(): string | null {
  return process.env.MERCADOPAGO_WEBHOOK_SECRET?.trim() || null
}

/**
 * Checks the `x-signature` header of a Mercado Pago notification
 * (RF30, #57). The manifest is `id:<data.id>;request-id:<x-request-id>;
 * ts:<ts>;` (parts without a value are left out, alphanumeric ids in
 * lower case) signed with HMAC-SHA256 and the webhook secret; the hex
 * digests are compared in constant time.
 *
 * @param input - Signature header, request id header, `data.id` of the
 * query string and the secret.
 * @returns True when the signature matches.
 */
export function verifyWebhookSignature(input: {
  signature: string | null
  requestId: string | null
  dataId: string | null
  secret: string
}): boolean {
  if (!input.signature) return false
  const parts = new Map(
    input.signature.split(",").map((part) => {
      const [key, ...value] = part.split("=")
      return [key.trim(), value.join("=").trim()] as const
    })
  )
  const ts = parts.get("ts")
  const v1 = parts.get("v1")
  if (!ts || !v1 || !/^[0-9a-f]{64}$/i.test(v1)) return false
  const dataId = input.dataId
    ? /^[a-z0-9]+$/i.test(input.dataId)
      ? input.dataId.toLowerCase()
      : input.dataId
    : null
  const manifest = [
    dataId ? `id:${dataId};` : "",
    input.requestId ? `request-id:${input.requestId};` : "",
    `ts:${ts};`,
  ].join("")
  const expected = createHmac("sha256", input.secret).update(manifest).digest()
  const received = Buffer.from(v1, "hex")
  return (
    received.length === expected.length && timingSafeEqual(received, expected)
  )
}

/**
 * Finds the payment created for one of our payment rows, by the
 * `external_reference`, when the creation call got no answer (#57).
 *
 * @param externalReference - Our payment row id.
 * @param fetcher - Fetch implementation (replaced in tests).
 * @returns The newest payment found, or null.
 * @throws MercadoPagoError.
 */
export async function findMercadoPagoPaymentByReference(
  externalReference: string,
  fetcher: typeof fetch = fetch
): Promise<ProviderPayment | null> {
  const query = new URLSearchParams({
    external_reference: externalReference,
    sort: "date_created",
    criteria: "desc",
    limit: "1",
  })
  const raw = await callMercadoPago(
    "search_payment",
    `/v1/payments/search?${query}`,
    { method: "GET" },
    fetcher
  )
  const results = (raw as { results?: unknown } | null)?.results
  if (!Array.isArray(results) || results.length === 0) return null
  return toProviderPayment(results[0])
}

/**
 * Reads a payment from `GET /v1/payments/{id}`: the source of truth for
 * the webhook and the reconciliation (RF30, #57).
 *
 * @param id - Mercado Pago payment id.
 * @param fetcher - Fetch implementation (replaced in tests).
 * @returns The payment.
 * @throws MercadoPagoError.
 */
export async function getMercadoPagoPayment(
  id: string,
  fetcher: typeof fetch = fetch
): Promise<ProviderPayment> {
  if (!/^\d{1,20}$/.test(id)) throw new MercadoPagoError("not_found")
  const raw = await callMercadoPago(
    "get_payment",
    `/v1/payments/${id}`,
    { method: "GET" },
    fetcher
  )
  return toProviderPayment(raw)
}
