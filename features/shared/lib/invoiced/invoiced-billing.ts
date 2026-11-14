import "server-only"
import type { Prisma } from "@/generated/prisma/client"
import { invoicedInstallmentsEmail } from "@/emails/templates"
import { enqueueEmail } from "@/features/shared/lib/email/mailer"
import { siteUrl } from "@/features/shared/lib/email/site-url"
import {
  boletoNumber,
  DEMO_BOLETO_BANK_CODE,
  digitableLine,
  planInstallments,
} from "@/features/shared/lib/invoiced/invoiced-math"
import { getSetting } from "@/features/shared/lib/settings/settings"

/** Setting with the invoiced due dates, in days (RN03). */
export const INVOICED_DUE_DAYS_KEY = "payment.invoiced_due_days"

/**
 * Invoiced due dates from the settings table (RN03), e.g. [28, 56].
 *
 * @param client - Prisma client or transaction.
 * @returns The positive whole days, sorted.
 * @throws Error when the setting holds no valid day.
 */
export async function loadInvoicedDueDays(
  client: Pick<Prisma.TransactionClient, "setting">
): Promise<number[]> {
  const value = await getSetting(INVOICED_DUE_DAYS_KEY, client)
  const days = (Array.isArray(value) ? value : [])
    .map(Number)
    .filter((day) => Number.isInteger(day) && day > 0)
    .sort((a, b) => a - b)
  if (days.length === 0) throw new Error("Invalid invoiced due days setting")
  return days
}

/**
 * Creates the installments of an invoiced order when it is confirmed
 * (RF12, RF33, RN03): one own boleto per due date (28 and 56 days by
 * default), with its number and digitable line, and queues the e-mail
 * with the due dates to the customer (RF53). Runs inside the
 * transaction that confirms the order; does nothing for orders paid
 * through Mercado Pago or that already have installments (idempotent).
 *
 * @param tx - Prisma transaction.
 * @param input - Order and the confirmation time.
 * @returns How many installments were created.
 */
export async function createInvoicedInstallments(
  tx: Prisma.TransactionClient,
  input: { orderId: string; now: Date }
): Promise<number> {
  const order = await tx.order.findUnique({
    where: { id: input.orderId },
    select: {
      id: true,
      number: true,
      total: true,
      paymentMethod: true,
      user: { select: { name: true, email: true } },
      receivables: { select: { id: true }, take: 1 },
    },
  })
  if (!order || order.paymentMethod !== "INVOICED") return 0
  if (order.receivables.length > 0) return 0

  const plan = planInstallments(
    order.total.toFixed(2),
    await loadInvoicedDueDays(tx),
    input.now
  )
  const rows = plan.map((item) => {
    const number = boletoNumber(order.number, item.sequence)
    return {
      orderId: order.id,
      sequence: item.sequence,
      dueDays: item.dueDays,
      amount: item.amount,
      dueDate: item.dueDate,
      boletoNumber: number,
      digitableLine: digitableLine({
        bankCode: DEMO_BOLETO_BANK_CODE,
        boletoNumber: number,
        dueDate: item.dueDate,
        amount: item.amount,
      }),
      createdAt: input.now,
    }
  })
  await tx.receivable.createMany({ data: rows })
  await enqueueEmail(tx, {
    to: order.user.email,
    ...invoicedInstallmentsEmail({
      name: order.user.name,
      number: order.number,
      total: order.total.toFixed(2),
      url: `${siteUrl()}/conta/pedidos/${order.id}`,
      installments: rows.map((row) => ({
        sequence: row.sequence,
        amount: row.amount,
        dueDate: row.dueDate,
        digitableLine: row.digitableLine,
      })),
    }),
  })
  return rows.length
}

/**
 * Cancels the open installments of an invoiced order that was canceled
 * or refunded, so they leave the receivables. Paid ones stay as they
 * are; their money goes back through the refund flow (#59).
 *
 * @param tx - Prisma transaction of the status change.
 * @param orderId - Order id.
 * @returns How many installments were canceled.
 */
export async function cancelOpenInstallments(
  tx: Prisma.TransactionClient,
  orderId: string
): Promise<number> {
  const result = await tx.receivable.updateMany({
    where: { orderId, status: "OPEN" },
    data: { status: "CANCELED" },
  })
  return result.count
}
