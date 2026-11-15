"use server"

import type { Prisma } from "@/generated/prisma/client"
import {
  orderPaymentSchema,
  payOrderSchema,
  type BoletoFormData,
  type CardFormData,
  type PayOrderInput,
  type PixFormData,
} from "@/features/payment/order-payment/schema/payment-schema"
import { getCurrentUser } from "@/features/shared/lib/auth/session"
import { UNAUTHENTICATED_MESSAGE } from "@/features/shared/lib/db/permissions"
import { prisma } from "@/features/shared/lib/db/prisma"
import {
  AppError,
  toActionError,
  type ActionResult,
} from "@/features/shared/lib/errors/action-result"
import { logger } from "@/features/shared/lib/logger/logger"
import {
  createMercadoPagoPayment,
  MercadoPagoError,
  mercadoPagoConfig,
  mercadoPagoNotificationUrl,
  mercadoPagoPublicKey,
  type CreatePaymentBody,
  type PaymentStatusKey,
  type ProviderPayment,
} from "@/features/shared/lib/mercadopago/mercadopago"
import type { OrderStatusKey } from "@/features/shared/lib/orders/order-status"
import {
  PAYMENT_METHOD_LABEL,
  PAYMENT_STATUS,
  paymentStatusMessage,
} from "@/features/shared/lib/payments/payment-messages"
import {
  loadPaymentDeadlines,
  paymentExpiresAt,
  toMercadoPagoDate,
} from "@/features/shared/lib/payments/payment-deadlines"
import { applyProviderPayment } from "@/features/shared/lib/payments/payment-sync"
import { enforceActionRateLimit } from "@/features/shared/lib/rate-limit/action-limit"

/** Methods paid online through the Payment Brick (RF29). */
const ONLINE_METHODS = ["CARD", "PIX", "BOLETO"] as const

/** A payment attempt as the customer sees it (RF31, RF32). */
export type PaymentView = {
  /** Our payment row id. */
  id: string
  /** Method key. */
  method: string
  /** Method label. */
  methodLabel: string
  /** Stored status. */
  status: PaymentStatusKey
  /** Status label. */
  statusLabel: string
  /** Message for the customer. */
  message: string
  /** Mercado Pago payment id (RF32), once known. */
  paymentId: string | null
  /** Amount, decimal string. */
  amount: string
  /** Card installments. */
  installments: number
  /** Creation date, ISO string. */
  createdAt: string
  /** Until when a Pix or boleto may be paid, ISO string (RN14). */
  expiresAt: string | null
  /** Pix copy-and-paste code and QR Code image (RF29). */
  pix: { qrCode: string; qrCodeImage: string | null } | null
  /** Boleto PDF link and digitable line (RF29). */
  boleto: { url: string | null; line: string | null } | null
}

/** What the payment page of an order shows. */
export type OrderPaymentContext = {
  /** Order id. */
  orderId: string
  /** Readable order number. */
  number: string
  /** Order status. */
  status: OrderStatusKey
  /** Payment method chosen at checkout. */
  method: string
  /** Method label. */
  methodLabel: string
  /** Order total, decimal string. */
  total: string
  /** Public key of the Bricks, or null when online payment is off. */
  publicKey: string | null
  /** E-mail of the payer, prefilled in the Brick. */
  payerEmail: string
  /** Whether the customer may pay now. */
  canPay: boolean
  /** Why the customer may not pay now, in Portuguese. */
  blockedReason: string | null
  /** Most installments the card may be split into (RF14). */
  maxInstallments: number
  /** Payment attempts, newest first. */
  payments: PaymentView[]
}

/** Result of a payment attempt. */
export type PaymentAttempt = {
  /** The attempt. */
  payment: PaymentView
  /** Order status after the attempt. */
  orderStatus: OrderStatusKey
  /** 3DS challenge to show, when the issuer asks for it (RF37). */
  threeDs: {
    paymentId: string
    externalResourceUrl: string
    creq: string
  } | null
}

/** Message when online payment is not configured. */
const PAYMENT_OFF_MESSAGE =
  "O pagamento online está indisponível no momento. Tente novamente mais tarde ou fale com o atendimento."

/** Message when the order does not wait for a payment. */
const NOT_PAYABLE_MESSAGE = "Este pedido não está aguardando pagamento."

/** Message when another attempt is still open. */
const PAYMENT_OPEN_MESSAGE =
  "Já existe um pagamento em andamento para este pedido. Acompanhe o status nesta página."

const paymentSelect = {
  id: true,
  method: true,
  status: true,
  statusDetail: true,
  paymentId: true,
  amount: true,
  installments: true,
  createdAt: true,
  expiresAt: true,
  pixQrCode: true,
  pixQrCodeImage: true,
  boletoUrl: true,
  boletoLine: true,
} satisfies Prisma.PaymentSelect

type PaymentRow = Prisma.PaymentGetPayload<{ select: typeof paymentSelect }>

/**
 * Maps a payment row to what the customer sees.
 *
 * @param row - Payment row.
 * @returns The view.
 */
function toPaymentView(row: PaymentRow): PaymentView {
  return {
    id: row.id,
    method: row.method,
    methodLabel: PAYMENT_METHOD_LABEL[row.method] ?? row.method,
    status: row.status,
    statusLabel: PAYMENT_STATUS[row.status]?.label ?? row.status,
    message: paymentStatusMessage(row.status, row.statusDetail),
    paymentId: row.paymentId,
    amount: row.amount.toFixed(2),
    installments: row.installments,
    createdAt: row.createdAt.toISOString(),
    expiresAt: row.expiresAt?.toISOString() ?? null,
    pix: row.pixQrCode
      ? { qrCode: row.pixQrCode, qrCodeImage: row.pixQrCodeImage }
      : null,
    boleto:
      row.boletoUrl || row.boletoLine
        ? {
            url: row.boletoUrl?.startsWith("https://") ? row.boletoUrl : null,
            line: row.boletoLine,
          }
        : null,
  }
}

/**
 * Logged-in user id, from the session (never from the request).
 *
 * @returns The user id.
 * @throws AppError("unauthenticated").
 */
async function sessionUserId(): Promise<string> {
  const user = await getCurrentUser()
  if (!user) throw new AppError(UNAUTHENTICATED_MESSAGE, "unauthenticated")
  return user.id
}

const orderSelect = {
  id: true,
  number: true,
  status: true,
  paymentMethod: true,
  total: true,
  user: { select: { email: true, document: true, personType: true } },
  payments: { select: paymentSelect, orderBy: { createdAt: "desc" } },
} satisfies Prisma.OrderSelect

type PayableOrder = Prisma.OrderGetPayload<{ select: typeof orderSelect }>

/**
 * Loads an order of the logged-in customer. Only the buyer pays the
 * order; anyone else gets "not found", so the id reveals nothing.
 *
 * @param client - Prisma client or transaction.
 * @param orderId - Order id.
 * @param userId - Session user id.
 * @returns The order.
 * @throws AppError("not_found").
 */
async function loadOwnOrder(
  client: Pick<Prisma.TransactionClient, "order">,
  orderId: string,
  userId: string
): Promise<PayableOrder> {
  const order = await client.order.findFirst({
    where: { id: orderId, userId },
    select: orderSelect,
  })
  if (!order) throw new AppError("Pedido não encontrado.", "not_found")
  return order
}

/**
 * Why the order cannot be paid now, if it cannot.
 *
 * @param order - The order.
 * @returns The reason, or null when the payment may start.
 */
function blockedReason(order: PayableOrder): string | null {
  if (order.status === "AWAITING_APPROVAL") {
    return "O pedido aguarda a aprovação da empresa. O pagamento é liberado depois da aprovação."
  }
  if (order.status === "AWAITING_SHIPPING_QUOTE") {
    return "O frete do pedido está em cotação. O pagamento é liberado quando o valor for enviado."
  }
  if (order.status !== "AWAITING_PAYMENT") return NOT_PAYABLE_MESSAGE
  if (!(ONLINE_METHODS as readonly string[]).includes(order.paymentMethod)) {
    return "A forma de pagamento deste pedido não é paga pelo site."
  }
  if (
    order.payments.some(
      (payment) => payment.status === "PENDING" || payment.status === "APPROVED"
    )
  ) {
    return PAYMENT_OPEN_MESSAGE
  }
  return null
}

/**
 * Most installments allowed for the order (RF14).
 *
 * @returns The maximum.
 */
async function maxInstallmentsFor(): Promise<number> {
  return 1
}

/**
 * Loads the payment page of an order: status, attempts and whether the
 * customer may pay now (RF28, RF31).
 *
 * @param input - Order id.
 * @returns `{ success: true, context }` or `{ success: false, error }`.
 */
export async function getOrderPayment(input: {
  orderId: string
}): Promise<ActionResult<{ context: OrderPaymentContext }>> {
  try {
    const parsed = orderPaymentSchema.safeParse(input)
    if (!parsed.success) throw new AppError("Pedido inválido.", "invalid")
    const userId = await sessionUserId()
    const order = await loadOwnOrder(prisma, parsed.data.orderId, userId)
    const publicKey = mercadoPagoConfig() ? mercadoPagoPublicKey() : null
    const reason = blockedReason(order)
    return {
      success: true,
      context: {
        orderId: order.id,
        number: order.number,
        status: order.status,
        method: order.paymentMethod,
        methodLabel:
          PAYMENT_METHOD_LABEL[order.paymentMethod] ?? order.paymentMethod,
        total: order.total.toFixed(2),
        publicKey,
        payerEmail: order.user.email,
        canPay: reason === null && publicKey !== null,
        blockedReason: reason ?? (publicKey ? null : PAYMENT_OFF_MESSAGE),
        maxInstallments: await maxInstallmentsFor(),
        payments: order.payments.map(toPaymentView),
      },
    }
  } catch (error) {
    return toActionError(error, { action: "getOrderPayment" })
  }
}

/** Brick data of the chosen method. */
type MethodFormData =
  | { method: "CARD"; formData: CardFormData }
  | { method: "PIX"; formData: PixFormData }
  | { method: "BOLETO"; formData: BoletoFormData }

/**
 * Builds the `/v1/payments` body (RF36). The amount comes from the
 * order, never from the browser. A card is only the Brick token (RF35,
 * RN19), with 3DS when the issuer asks (RF37); Pix and boleto carry the
 * configured expiration (RN14).
 *
 * @param input - Order, payment row, expiration and Brick data.
 * @returns The body.
 */
function paymentBody(
  input: {
    order: PayableOrder
    paymentRowId: string
    expiresAt: Date | null
  } & MethodFormData
): CreatePaymentBody {
  const { order } = input
  const notificationUrl = mercadoPagoNotificationUrl()
  const document = {
    type: order.user.personType === "PJ" ? "CNPJ" : "CPF",
    number: order.user.document,
  }
  const common = {
    transaction_amount: Number(order.total.toFixed(2)),
    description: `Pedido ${order.number} — Atelier Bureau`,
    external_reference: input.paymentRowId,
    ...(notificationUrl ? { notification_url: notificationUrl } : {}),
    metadata: { order_number: order.number },
    ...(input.expiresAt
      ? { date_of_expiration: toMercadoPagoDate(input.expiresAt) }
      : {}),
  }
  if (input.method === "CARD") {
    const { formData } = input
    return {
      ...common,
      payment_method_id: formData.payment_method_id,
      token: formData.token,
      installments: formData.installments,
      ...(formData.issuer_id ? { issuer_id: formData.issuer_id } : {}),
      three_d_secure_mode: "optional",
      statement_descriptor: "ATELIERBUREAU",
      payer: {
        email: order.user.email,
        identification: formData.payer?.identification ?? document,
      },
    }
  }
  if (input.method === "PIX") {
    return {
      ...common,
      payment_method_id: "pix",
      payer: { email: order.user.email, identification: document },
    }
  }
  const { payer } = input.formData
  return {
    ...common,
    payment_method_id: input.formData.payment_method_id,
    payer: {
      email: order.user.email,
      first_name: payer.first_name,
      last_name: payer.last_name,
      identification: payer.identification,
      address: payer.address,
    },
  }
}

/**
 * Pays an order with the Payment Brick by card, Pix or boleto (RF28,
 * RF29, RF35, RF36, RF37):
 * 1. checks the payload has no card data and validates it (RN19);
 * 2. takes the buyer from the session;
 * 3. locks the order, checks it waits for this payment and opens a
 *    payment row with the order total and, for Pix and boleto, the
 *    configured expiration (RN14);
 * 4. creates the payment in Mercado Pago with the row id as the
 *    idempotency key and external reference;
 * 5. applies the answer: payment_id, status and, only when approved,
 *    the order confirmation (RN13).
 * When Mercado Pago does not answer, the attempt stays pending and the
 * webhook or the reconciliation settles it.
 *
 * @param input - Order, method and Brick form data.
 * @returns `{ success: true, attempt }` or `{ success: false, error }`.
 */
export async function payOrder(
  input: PayOrderInput
): Promise<ActionResult<{ attempt: PaymentAttempt }>> {
  try {
    const parsed = payOrderSchema.safeParse(input)
    if (!parsed.success) {
      throw new AppError(
        parsed.error.issues[0]?.message ?? "Pagamento inválido.",
        "invalid"
      )
    }
    const data = parsed.data
    const userId = await sessionUserId()
    await enforceActionRateLimit("payment", { limit: 10, windowMs: 60_000 })
    if (!mercadoPagoConfig()) {
      throw new AppError(PAYMENT_OFF_MESSAGE, "payment_off")
    }

    const opened = await prisma.$transaction(async (tx) => {
      // Lock the order (justified raw query: Prisma has no row lock), so
      // two clicks never open two payments
      await tx.$queryRaw`SELECT id FROM orders WHERE id = ${data.orderId} FOR UPDATE`
      const order = await loadOwnOrder(tx, data.orderId, userId)
      const reason = blockedReason(order)
      if (reason) throw new AppError(reason, "not_payable")
      if (order.paymentMethod !== data.method) {
        throw new AppError("Forma de pagamento inválida.", "invalid_method")
      }
      const expiresAt =
        data.method === "CARD"
          ? null
          : paymentExpiresAt(
              data.method,
              new Date(),
              await loadPaymentDeadlines(tx)
            )
      const payment = await tx.payment.create({
        data: {
          orderId: order.id,
          method: data.method,
          status: "PENDING",
          amount: order.total,
          installments: data.method === "CARD" ? data.formData.installments : 1,
          expiresAt,
        },
        select: { id: true },
      })
      return { order, paymentRowId: payment.id, expiresAt }
    })

    let provider: ProviderPayment
    try {
      provider = await createMercadoPagoPayment(
        paymentBody({
          order: opened.order,
          paymentRowId: opened.paymentRowId,
          expiresAt: opened.expiresAt,
          ...data,
        }),
        opened.paymentRowId
      )
    } catch (error) {
      if (!(error instanceof MercadoPagoError)) throw error
      const refused = error.kind === "refused" || error.kind === "not_found"
      await prisma.payment.update({
        where: { id: opened.paymentRowId },
        data: refused
          ? { status: "REJECTED", statusDetail: "provider_refused" }
          : { statusDetail: "provider_unconfirmed" },
      })
      if (refused) {
        throw new AppError(
          paymentStatusMessage("REJECTED", "provider_refused"),
          "provider_refused"
        )
      }
      logger.warn("payment outcome unknown", { orderId: opened.order.id })
      const row = await prisma.payment.findUniqueOrThrow({
        where: { id: opened.paymentRowId },
        select: paymentSelect,
      })
      return {
        success: true,
        attempt: {
          payment: toPaymentView(row),
          orderStatus: opened.order.status,
          threeDs: null,
        },
      }
    }

    const synced = await prisma.$transaction((tx) =>
      applyProviderPayment(tx, provider, { userId })
    )
    const row = await prisma.payment.findUniqueOrThrow({
      where: { id: opened.paymentRowId },
      select: paymentSelect,
    })
    return {
      success: true,
      attempt: {
        payment: toPaymentView(row),
        orderStatus: synced.orderStatus ?? opened.order.status,
        threeDs:
          row.status === "PENDING" && provider.threeDs
            ? { paymentId: provider.id, ...provider.threeDs }
            : null,
      },
    }
  } catch (error) {
    return toActionError(error, { action: "payOrder" })
  }
}
