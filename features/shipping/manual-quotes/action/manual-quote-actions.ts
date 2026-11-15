"use server"

import { z } from "zod"
import { writeAudit } from "@/features/shared/lib/db/audit"
import { requirePermission } from "@/features/shared/lib/db/permissions"
import { prisma } from "@/features/shared/lib/db/prisma"
import {
  AppError,
  toActionError,
  type ActionResult,
} from "@/features/shared/lib/errors/action-result"
import type { OrderStatusKey } from "@/features/shared/lib/orders/order-status"
import { getNumberSetting } from "@/features/shared/lib/settings/settings"
import { notifyManualQuoteAnswered } from "@/features/shared/lib/shipping/manual-quote"
import { fromCents, toCents } from "@/features/shared/lib/shipping/strategies"
import {
  answerManualQuoteSchema,
  type AnswerManualQuoteInput,
} from "@/features/shipping/manual-quotes/schema/manual-quote-schema"

/** An order line with what the sales team needs to quote. */
export type ManualQuoteItem = {
  /** Product name snapshot. */
  productName: string
  /** SKU code snapshot. */
  skuCode: string
  /** Units. */
  quantity: number
  /** Unit weight, in kg. */
  weightKg: string
  /** Unit package dimensions, "C × L × A cm". */
  dimensions: string
  /** Whether the product needs assembly (RN16). */
  requiresAssembly: boolean
}

/** An order waiting for the manual shipping quote (#44). */
export type ManualQuoteRow = {
  /** Order id. */
  id: string
  /** Readable order number. */
  number: string
  /** Customer name. */
  customer: string
  /** Company name, for corporate orders. */
  company: string | null
  /** Order date, ISO. */
  createdAt: string
  /** Deadline promised to the customer, ISO; null when unknown. */
  respondBy: string | null
  /** Whether the deadline has passed. */
  overdue: boolean
  /** Why the shipping could not be calculated. */
  reason: string | null
  /** Destination CEP, city and state. */
  destination: string
  /** Products subtotal. */
  subtotal: string
  /** Order lines. */
  items: ManualQuoteItem[]
}

const quoteDataSchema = z
  .object({
    reason: z.string().optional(),
    respondBy: z.string().optional(),
  })
  .passthrough()

const destinationSchema = z
  .object({
    cep: z.string().optional(),
    city: z.string().optional(),
    state: z.string().optional(),
  })
  .passthrough()

/**
 * Describes the destination snapshot of the order.
 *
 * @param value - Address snapshot stored on the order.
 * @returns "CEP 00000-000 · City/UF", or a dash when unreadable.
 */
function describeDestination(value: unknown): string {
  const parsed = destinationSchema.safeParse(value)
  if (!parsed.success) return "—"
  const { cep, city, state } = parsed.data
  const parts = [
    cep ? `CEP ${cep.replace(/^(\d{5})(\d{3})$/, "$1-$2")}` : null,
    city ? `${city}${state ? `/${state}` : ""}` : null,
  ].filter(Boolean)
  return parts.length > 0 ? parts.join(" · ") : "—"
}

/**
 * Sales queue of orders without a calculable shipping (RN16, RN20),
 * oldest deadline first.
 *
 * @returns `{ success: true, orders }` or `{ success: false, error }`.
 */
export async function listManualShippingQuotes(): Promise<
  ActionResult<{ orders: ManualQuoteRow[] }>
> {
  try {
    await requirePermission("quote:read")
    const rows = await prisma.order.findMany({
      where: { status: "AWAITING_SHIPPING_QUOTE" },
      orderBy: { createdAt: "asc" },
      take: 200,
      select: {
        id: true,
        number: true,
        subtotal: true,
        createdAt: true,
        shippingAddress: true,
        user: { select: { name: true } },
        organization: { select: { name: true } },
        shipment: { select: { quoteData: true } },
        items: {
          select: {
            productName: true,
            skuCode: true,
            quantity: true,
            sku: {
              select: {
                product: {
                  select: {
                    weightKg: true,
                    lengthCm: true,
                    widthCm: true,
                    heightCm: true,
                    requiresInstallation: true,
                  },
                },
              },
            },
          },
        },
      },
    })
    const now = Date.now()
    const orders = rows.map((row): ManualQuoteRow => {
      const data = quoteDataSchema.safeParse(row.shipment?.quoteData ?? {})
      const respondBy = data.success ? (data.data.respondBy ?? null) : null
      return {
        id: row.id,
        number: row.number,
        customer: row.user.name,
        company: row.organization?.name ?? null,
        createdAt: row.createdAt.toISOString(),
        respondBy,
        overdue: respondBy !== null && Date.parse(respondBy) < now,
        reason: data.success ? (data.data.reason ?? null) : null,
        destination: describeDestination(row.shippingAddress),
        subtotal: row.subtotal.toFixed(2),
        items: row.items.map((item) => {
          const product = item.sku.product
          return {
            productName: item.productName,
            skuCode: item.skuCode,
            quantity: item.quantity,
            weightKg: product.weightKg.toString(),
            dimensions: `${product.lengthCm} × ${product.widthCm} × ${product.heightCm} cm`,
            requiresAssembly: product.requiresInstallation,
          }
        }),
      }
    })
    orders.sort(
      (a, b) =>
        (a.respondBy ? Date.parse(a.respondBy) : Infinity) -
        (b.respondBy ? Date.parse(b.respondBy) : Infinity)
    )
    return { success: true, orders }
  } catch (error) {
    return toActionError(error, { action: "listManualShippingQuotes" })
  }
}

/**
 * Records the shipping quoted by hand by the sales team (#44, RN20):
 * updates the shipment and the order totals and moves the order on to
 * approval (RN01, re-checked with the shipping in the total) or to
 * payment. The customer is told by e-mail.
 *
 * @param input - Order, method, carrier, service, price and time.
 * @returns `{ success: true, status }` or `{ success: false, error }`.
 */
export async function answerManualShippingQuote(
  input: AnswerManualQuoteInput
): Promise<ActionResult<{ status: OrderStatusKey }>> {
  try {
    const parsed = answerManualQuoteSchema.safeParse(input)
    if (!parsed.success) {
      throw new AppError(
        parsed.error.issues[0]?.message ?? "Revise a cotação do frete.",
        "invalid"
      )
    }
    const { user } = await requirePermission("quote:answer")
    const answer = parsed.data
    const price = fromCents(toCents(answer.price))

    const result = await prisma.$transaction(async (tx) => {
      const order = await tx.order.findUnique({
        where: { id: answer.orderId },
        select: {
          id: true,
          number: true,
          status: true,
          subtotal: true,
          discount: true,
          servicesTotal: true,
          organizationId: true,
          requiresApproval: true,
          approvedAt: true,
          user: { select: { name: true, email: true } },
          shipment: { select: { price: true, quoteData: true } },
        },
      })
      if (!order || order.status !== "AWAITING_SHIPPING_QUOTE") {
        throw new AppError(
          "Este pedido não está aguardando cotação de frete.",
          "invalid_status"
        )
      }

      const total = fromCents(
        toCents(order.subtotal.toString()) -
          toCents(order.discount.toString()) +
          toCents(order.servicesTotal.toString()) +
          toCents(price)
      )
      const approvalLimit = await getNumberSetting("order.approval_limit", tx)
      const requiresApproval =
        order.requiresApproval ||
        (order.organizationId !== null && Number(total) > approvalLimit)
      const status: OrderStatusKey =
        requiresApproval && !order.approvedAt
          ? "AWAITING_APPROVAL"
          : "AWAITING_PAYMENT"

      // Only one answer wins when two people quote the same order
      const moved = await tx.order.updateMany({
        where: { id: order.id, status: "AWAITING_SHIPPING_QUOTE" },
        data: { status, shippingTotal: price, total, requiresApproval },
      })
      if (moved.count !== 1) {
        throw new AppError(
          "Este pedido não está aguardando cotação de frete.",
          "invalid_status"
        )
      }
      const previous = quoteDataSchema.safeParse(
        order.shipment?.quoteData ?? {}
      )
      const shipment = {
        method: answer.method,
        carrier: answer.carrier,
        service: answer.service,
        price,
        deliveryDays: answer.deliveryDays,
        quoteData: {
          ...(previous.success ? previous.data : {}),
          answeredAt: new Date().toISOString(),
          answeredById: user.id,
          note: answer.note || null,
        },
      }
      await tx.shipment.upsert({
        where: { orderId: order.id },
        create: { orderId: order.id, ...shipment },
        update: shipment,
      })
      await tx.orderStatusHistory.create({
        data: {
          orderId: order.id,
          fromStatus: "AWAITING_SHIPPING_QUOTE",
          toStatus: status,
          changedById: user.id,
          note: "Frete cotado pelo comercial.",
        },
      })
      await writeAudit(tx, {
        userId: user.id,
        action: "order.shipping_quote.answer",
        entity: "order",
        entityId: order.id,
        before: {
          status: order.status,
          shippingPrice: order.shipment?.price ?? null,
        },
        after: {
          status,
          method: answer.method,
          carrier: answer.carrier,
          service: answer.service,
          price,
          deliveryDays: answer.deliveryDays,
          total,
        },
      })
      return { order, status, total }
    })

    await notifyManualQuoteAnswered({
      to: result.order.user.email,
      name: result.order.user.name,
      orderNumber: result.order.number,
      price,
      deliveryDays: answer.deliveryDays,
      total: result.total,
    })
    return { success: true, status: result.status }
  } catch (error) {
    return toActionError(error, { action: "answerManualShippingQuote" })
  }
}
