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

/** Orders that no longer hold credit: canceled or refunded. */
export const CREDIT_RELEASED_STATUSES: readonly OrderStatusKey[] = [
  "CANCELED",
  "REFUNDED",
]

type Client = Pick<Prisma.TransactionClient, "order" | "organization">

/**
 * Filter of the invoiced orders that hold the credit of the accounts:
 * every invoiced order not canceled nor refunded (RN10).
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
 * invoiced orders (RN10).
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
  for (const row of rows) {
    if (!row.organizationId) continue
    usage.set(row.organizationId, row._sum.total?.toFixed(2) ?? "0.00")
  }
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
  const account = await tx.organization.findFirst({
    where: { id: organizationId, deletedAt: null },
    select: { creditStatus: true, creditLimit: true },
  })
  const usage = await loadCreditUsage(
    tx,
    [organizationId],
    input.excludeOrderId
  )
  const position = creditPosition({
    status: (account?.creditStatus ?? "NONE") as CreditStatusKey,
    limit: account?.creditLimit?.toFixed(2) ?? null,
    used: usage.get(organizationId) ?? "0.00",
  })
  const check = checkInvoicedCredit(position, input.amount)
  if (!check.allowed) throw new AppError(check.message, check.code)
  return position
}
