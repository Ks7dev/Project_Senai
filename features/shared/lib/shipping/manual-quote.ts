import "server-only"
import type { Prisma } from "@/generated/prisma/client"
import { prisma } from "@/features/shared/lib/db/prisma"
import { sendEmail } from "@/features/shared/lib/email/mailer"
import { AppError } from "@/features/shared/lib/errors/action-result"
import { logger } from "@/features/shared/lib/logger/logger"
import { transitionOrder } from "@/features/shared/lib/orders/order-lifecycle"
import { getNumberSetting } from "@/features/shared/lib/settings/settings"
import { addBusinessDays } from "@/features/shared/lib/shipping/business-days"
import {
  manualQuoteReasonMessage,
  manualQuoteResponseMessage,
} from "@/features/shared/lib/shipping/shipping-messages"
import type { ManualQuoteReason } from "@/features/shared/lib/shipping/strategies"

/** Statuses an order may leave to wait for the manual shipping quote. */
const QUEUEABLE_STATUSES = ["AWAITING_APPROVAL", "AWAITING_PAYMENT"] as const

/** Message shown when the order already left the checkout. */
const NOT_QUEUEABLE_MESSAGE =
  "Este pedido não pode mais seguir para a cotação de frete."

/** What the shipment keeps while the sales team quotes (RN20). */
export type ManualQuoteData = {
  /** Why the shipping could not be calculated. */
  reason: ManualQuoteReason
  /** When the order entered the queue, ISO date. */
  requestedAt: string
  /** Deadline promised to the customer, ISO date. */
  respondBy: string
}

const dateFormat = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeZone: "America/Sao_Paulo",
})

const brl = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
})

/**
 * Return time of the manual shipping quote, from the settings table
 * (never fixed in the code).
 *
 * @param client - Prisma client or transaction.
 * @returns Business days.
 */
export async function loadManualQuoteResponseDays(
  client: Pick<Prisma.TransactionClient, "setting"> = prisma
): Promise<number> {
  return getNumberSetting(
    "shipping.manual_quote_response_business_days",
    client
  )
}

/**
 * Sends an order without a calculable shipping to the sales queue
 * (RN16, RN20): the order waits in `AWAITING_SHIPPING_QUOTE` with a
 * `MANUAL_QUOTE` shipment that records the reason and the return
 * deadline. Runs inside the checkout transaction; the customer notice
 * is sent after the commit with `notifyManualQuoteRequested`.
 *
 * @param tx - Prisma transaction.
 * @param input - Order, reason and the user who placed the order.
 * @returns The return deadline and the configured business days.
 * @throws AppError when the order does not exist or already left the
 * checkout.
 */
export async function sendOrderToManualShippingQuote(
  tx: Prisma.TransactionClient,
  input: {
    orderId: string
    reason: ManualQuoteReason
    changedById: string
    now?: Date
  }
): Promise<{ respondBy: Date; businessDays: number }> {
  const order = await tx.order.findUnique({
    where: { id: input.orderId },
    select: { status: true },
  })
  if (!order) throw new AppError("Pedido não encontrado.", "not_found")
  if (!(QUEUEABLE_STATUSES as readonly string[]).includes(order.status)) {
    throw new AppError(NOT_QUEUEABLE_MESSAGE, "invalid_status")
  }

  const now = input.now ?? new Date()
  const businessDays = await loadManualQuoteResponseDays(tx)
  const respondBy = addBusinessDays(now, businessDays)
  const quoteData: ManualQuoteData = {
    reason: input.reason,
    requestedAt: now.toISOString(),
    respondBy: respondBy.toISOString(),
  }
  const shipment = {
    method: "MANUAL_QUOTE" as const,
    carrier: null,
    service: null,
    price: "0.00",
    deliveryDays: null,
    quoteData,
  }

  await transitionOrder(tx, {
    orderId: input.orderId,
    to: "AWAITING_SHIPPING_QUOTE",
    changedById: input.changedById,
    note: "Frete sem cálculo automático: enviado à cotação do comercial.",
    expectedFrom: QUEUEABLE_STATUSES,
    unexpectedMessage: NOT_QUEUEABLE_MESSAGE,
    now,
  })
  await tx.shipment.upsert({
    where: { orderId: input.orderId },
    create: { orderId: input.orderId, ...shipment },
    update: shipment,
  })
  return { respondBy, businessDays }
}

/**
 * Tells the customer that the shipping will be quoted by the sales
 * team and when they will hear back (#44). A failure is logged and
 * never undoes the order.
 *
 * @param input - Recipient, order number, reason and deadline.
 */
export async function notifyManualQuoteRequested(input: {
  to: string
  name: string
  orderNumber: string
  reason: ManualQuoteReason
  businessDays: number
  respondBy: Date
}): Promise<void> {
  try {
    await sendEmail({
      to: input.to,
      template: "shipping.manual_quote_requested",
      subject: `Pedido ${input.orderNumber}: frete em cotação`,
      text: [
        `Olá, ${input.name}.`,
        "",
        `Recebemos o pedido ${input.orderNumber}.`,
        manualQuoteReasonMessage(input.reason),
        `${manualQuoteResponseMessage(input.businessDays)} Retorno previsto até ${dateFormat.format(input.respondBy)}.`,
        "",
        "Assim que o frete for cotado, você recebe o valor e pode seguir para o pagamento.",
        "",
        "Atelier Bureau",
      ].join("\n"),
    })
  } catch (error) {
    logger.error("manual quote notice failed", {
      error: error instanceof Error ? error.name : "unknown",
    })
  }
}

/**
 * Tells the customer that the sales team quoted the shipping (#44). A
 * failure is logged and never undoes the answer.
 *
 * @param input - Recipient, order number, price and delivery time.
 */
export async function notifyManualQuoteAnswered(input: {
  to: string
  name: string
  orderNumber: string
  price: string
  deliveryDays: number | null
  total: string
}): Promise<void> {
  const time =
    input.deliveryDays === null
      ? "com data agendada com você"
      : `em até ${input.deliveryDays} ${input.deliveryDays === 1 ? "dia útil" : "dias úteis"}`
  try {
    await sendEmail({
      to: input.to,
      template: "shipping.manual_quote_answered",
      subject: `Pedido ${input.orderNumber}: frete cotado`,
      text: [
        `Olá, ${input.name}.`,
        "",
        `O frete do pedido ${input.orderNumber} foi cotado: ${brl.format(Number(input.price))}, entrega ${time}.`,
        `Novo total do pedido: ${brl.format(Number(input.total))}.`,
        "",
        "Acesse Minha conta > Pedidos para seguir com o pedido.",
        "",
        "Atelier Bureau",
      ].join("\n"),
    })
  } catch (error) {
    logger.error("manual quote answer notice failed", {
      error: error instanceof Error ? error.name : "unknown",
    })
  }
}
