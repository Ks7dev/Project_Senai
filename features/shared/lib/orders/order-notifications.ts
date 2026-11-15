import "server-only"
import type { Prisma } from "@/generated/prisma/client"
import {
  approvalPendingEmail,
  invoiceIssuedEmail,
  orderCanceledEmail,
  orderDeliveredEmail,
  orderShippedEmail,
  paymentConfirmedEmail,
  type OrderEmailData,
  type RenderedEmail,
} from "@/emails/templates"
import { parseRoles } from "@/features/shared/lib/auth/corporate-roles"
import { enqueueEmail } from "@/features/shared/lib/email/mailer"
import { siteUrl } from "@/features/shared/lib/email/site-url"
import type { OrderStatusKey } from "@/features/shared/lib/orders/order-status"

/** Statuses that send an e-mail (RF53). */
export const NOTIFIED_STATUSES: readonly OrderStatusKey[] = [
  "AWAITING_APPROVAL",
  "PAID",
  "INVOICED",
  "SHIPPED",
  "DELIVERED",
  "CANCELED",
]

/** Default text of the cancellation e-mail. */
const CANCELED_DEFAULT =
  "Seu pedido foi cancelado e os itens reservados voltaram ao estoque. Se houve pagamento, o estorno segue a política comercial."

/**
 * Queues the e-mails of an order status change in the same transaction
 * (RF53): approval pending goes to the company approvers (RN01); paid,
 * NF-e, shipped, delivered and canceled go to the customer. Statuses
 * of the manual shipping quote have their own e-mails (#44).
 *
 * @param tx - Prisma transaction of the status change.
 * @param input - Order and new status.
 * @returns How many e-mails were queued.
 */
export async function enqueueOrderStatusEmails(
  tx: Prisma.TransactionClient,
  input: { orderId: string; to: OrderStatusKey }
): Promise<number> {
  if (!NOTIFIED_STATUSES.includes(input.to)) return 0
  const order = await tx.order.findUnique({
    where: { id: input.orderId },
    select: {
      number: true,
      total: true,
      userId: true,
      organizationId: true,
      user: { select: { name: true, email: true } },
      shipment: { select: { carrier: true, trackingCode: true } },
    },
  })
  if (!order) return 0
  const url = `${siteUrl()}/conta/pedidos`
  const base: OrderEmailData = {
    name: order.user.name,
    number: order.number,
    total: order.total.toFixed(2),
    url,
  }

  const emails: Array<{ to: string; email: RenderedEmail }> = []
  if (input.to === "AWAITING_APPROVAL" && order.organizationId) {
    const members = await tx.member.findMany({
      where: {
        organizationId: order.organizationId,
        userId: { not: order.userId },
      },
      select: { role: true, user: { select: { name: true, email: true } } },
    })
    for (const member of members) {
      if (!parseRoles(member.role).includes("approver")) continue
      emails.push({
        to: member.user.email,
        email: approvalPendingEmail({
          ...base,
          name: member.user.name,
          requester: order.user.name,
        }),
      })
    }
  }
  const customer = order.user.email
  if (input.to === "PAID") {
    emails.push({ to: customer, email: paymentConfirmedEmail(base) })
  }
  if (input.to === "INVOICED") {
    emails.push({ to: customer, email: invoiceIssuedEmail(base) })
  }
  if (input.to === "SHIPPED") {
    emails.push({
      to: customer,
      email: orderShippedEmail({
        ...base,
        carrier: order.shipment?.carrier,
        trackingCode: order.shipment?.trackingCode,
      }),
    })
  }
  if (input.to === "DELIVERED") {
    emails.push({ to: customer, email: orderDeliveredEmail(base) })
  }
  if (input.to === "CANCELED") {
    emails.push({
      to: customer,
      email: orderCanceledEmail({ ...base, reason: CANCELED_DEFAULT }),
    })
  }

  for (const { to, email } of emails) {
    await enqueueEmail(tx, { to, ...email })
  }
  return emails.length
}
