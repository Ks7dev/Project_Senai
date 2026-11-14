import "server-only"
import type { Prisma } from "@/generated/prisma/client"
import {
  checkInvoicedCredit,
  creditPosition,
  type CreditPosition,
  type CreditStatusKey,
} from "@/features/shared/lib/credit/credit-math"
import { AppError } from "@/features/shared/lib/errors/action-result"
import type { OrderStatusKey } from "@/features/shared/lib/orders/order-status"
import { fromCents, toCents } from "@/features/shared/lib/shipping/strategies"

/** Orders that no longer hold credit: canceled or refunded. */
export const CREDIT_RELEASED_STATUSES: readonly OrderStatusKey[] = [
  "CANCELED",
  "REFUNDED",
]

type Client = Pick<Prisma.TransactionClient, "order" | "receivable">

/**
 * Filter of the invoiced orders that hold the credit of the accounts:
 * every invoiced order not canceled nor refunded (RN10). Their paid
 * installments give the credit back (RF33).
 *
 * @param organizationIds - Corporate accounts.
 * @param excludeOrderId - Order left out (the one being checked).
 * @returns The where clause.
 */
function creditOrdersWhere(
  organizationIds: string[],
  excludeOrderId?: string
): Prisma.OrderWhereInput {
  return {
    organizationId: { in: organizationIds },
    paymentMethod: "INVOICED",
    status: { notIn: [...CREDIT_RELEASED_STATUSES] },
    ...(excludeOrderId ? { id: { not: excludeOrderId } } : {}),
  }
}

/**
 * Credit in use of each corporate account: the total of its open
 * invoiced orders minus the installments already settled (RN10, RF33).
 *
 * @param client - Prisma client or transaction.
 * @param organizationIds - Corporate accounts.
 * @param excludeOrderId - Order left out of the sum.
 * @returns Used credit by account id, decimal strings.
 */
export async function loadCreditUsage(
  client: Client,
  organizationIds: string[],
  excludeOrderId?: string
): Promise<Map<string, string>> {
  const usage = new Map(organizationIds.map((id) => [id, "0.00"]))
  if (organizationIds.length === 0) return usage
  const rows = await client.order.groupBy({
    by: ["organizationId"],
    where: creditOrdersWhere(organizationIds, excludeOrderId),
    _sum: { total: true },
  })
  const cents = new Map<string, number>()
  for (const row of rows) {
    if (!row.organizationId) continue
    cents.set(row.organizationId, toCents(row._sum.total?.toFixed(2) ?? "0"))
  }
  const settled = await client.receivable.findMany({
    where: {
      status: "PAID",
      order: creditOrdersWhere(organizationIds, excludeOrderId),
    },
    select: { amount: true, order: { select: { organizationId: true } } },
  })
  for (const row of settled) {
    const id = row.order.organizationId
    if (!id) continue
    cents.set(id, (cents.get(id) ?? 0) - toCents(row.amount.toFixed(2)))
  }
  for (const [id, value] of cents) usage.set(id, fromCents(Math.max(0, value)))
  return usage
}

/**
 * Checks, inside the transaction that creates or confirms an invoiced
 * order, that the account is approved and that the order fits its
 * available credit (RN03, RN10). The account row is locked with
 * `SELECT ... FOR UPDATE` (justified raw query: Prisma has no row lock),
 * so two orders never take the same credit.
 *
 * @param tx - Prisma transaction.
 * @param input - Account, order total and the order left out of the use
 * (when the order already exists).
 * @returns The credit position before the order.
 * @throws AppError("credit_not_approved") or AppError("credit_limit_exceeded").
 */
export async function assertInvoicedCredit(
  tx: Prisma.TransactionClient,
  input: {
    organizationId: string | null
    amount: string
    excludeOrderId?: string
  }
): Promise<CreditPosition> {
  if (!input.organizationId) {
    const refused = checkInvoicedCredit(
      creditPosition({ status: "NONE", limit: null, used: "0.00" }),
      input.amount
    )
    if (!refused.allowed) throw new AppError(refused.message, refused.code)
  }
  const organizationId = input.organizationId!
  await tx.$queryRaw`SELECT id FROM organizations WHERE id = ${organizationId} FOR UPDATE`
  const position = await loadCreditPosition(
    tx,
    organizationId,
    input.excludeOrderId
  )
  const check = checkInvoicedCredit(position, input.amount)
  if (!check.allowed) throw new AppError(check.message, check.code)
  return position
}

/**
 * Credit position of one corporate account (RN10), without locking it:
 * used to show the invoiced option at checkout. The order itself is
 * always checked again by `assertInvoicedCredit`.
 *
 * @param client - Prisma client or transaction.
 * @param organizationId - Corporate account.
 * @param excludeOrderId - Order left out of the use.
 * @returns The position (no credit when the account does not exist).
 */
export async function loadCreditPosition(
  client: Client & Pick<Prisma.TransactionClient, "organization">,
  organizationId: string,
  excludeOrderId?: string
): Promise<CreditPosition> {
  const account = await client.organization.findFirst({
    where: { id: organizationId, deletedAt: null },
    select: { creditStatus: true, creditLimit: true },
  })
  const usage = await loadCreditUsage(client, [organizationId], excludeOrderId)
  return creditPosition({
    status: (account?.creditStatus ?? "NONE") as CreditStatusKey,
    limit: account?.creditLimit?.toFixed(2) ?? null,
    used: usage.get(organizationId) ?? "0.00",
  })
}
