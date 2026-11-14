"use server"

import type { Prisma } from "@/generated/prisma/client"
import {
  confirmInvoicedOrderSchema,
  receivablesFilterSchema,
  settleInstallmentSchema,
  type ConfirmInvoicedOrderInput,
  type ReceivableFilter,
  type ReceivablesFilterInput,
  type SettleInstallmentInput,
} from "@/features/finance/invoiced-billing/schema/invoiced-billing-schema"
import { hasPermission } from "@/features/shared/lib/auth/permissions"
import type { CreditPosition } from "@/features/shared/lib/credit/credit-math"
import {
  assertInvoicedCredit,
  CREDIT_RELEASED_STATUSES,
  loadCreditPosition,
} from "@/features/shared/lib/credit/credit-service"
import { writeAudit } from "@/features/shared/lib/db/audit"
import { requirePermission } from "@/features/shared/lib/db/permissions"
import { prisma } from "@/features/shared/lib/db/prisma"
import {
  AppError,
  toActionError,
  type ActionResult,
} from "@/features/shared/lib/errors/action-result"
import {
  installmentState,
  type InstallmentStateKey,
} from "@/features/shared/lib/invoiced/invoiced-math"
import { transitionOrder } from "@/features/shared/lib/orders/order-lifecycle"
import type { OrderStatusKey } from "@/features/shared/lib/orders/order-status"
import { toCents } from "@/features/shared/lib/shipping/strategies"

const brl = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
})

/** How many installments the list shows. */
const LIST_LIMIT = 200

/** An installment of an invoiced order in the receivables (RF33). */
export type ReceivableRow = {
  /** Installment id. */
  id: string
  /** Order id. */
  orderId: string
  /** Readable order number. */
  orderNumber: string
  /** Company of the order. */
  company: string | null
  /** Customer who placed the order. */
  customer: string
  /** Installment sequence and how many the order has, e.g. 1 of 2. */
  sequence: number
  /** Installments of the order. */
  count: number
  /** Days after the confirmation, e.g. 28. */
  dueDays: number
  /** Amount, decimal string. */
  amount: string
  /** Due date, ISO string. */
  dueDate: string
  /** Status shown (overdue when open past the due date). */
  state: InstallmentStateKey
  /** Own boleto number. */
  boletoNumber: string
  /** Digitable line. */
  digitableLine: string
  /** Settlement, when paid. */
  settlement: {
    paidAt: string
    paidAmount: string
    method: "MANUAL" | "BANK_RETURN"
    by: string | null
    note: string | null
  } | null
}

/** An invoiced order waiting for the finance confirmation (RN13). */
export type PendingInvoicedOrder = {
  /** Order id. */
  id: string
  /** Readable number. */
  number: string
  /** Company. */
  company: string | null
  /** Order total, decimal string. */
  total: string
  /** Order date, ISO string. */
  createdAt: string
  /** Credit position of the company, without this order. */
  credit: CreditPosition | null
}

/** What the receivables page shows. */
export type ReceivablesData = {
  /** Installments of the filter. */
  rows: ReceivableRow[]
  /** Total still to receive and total overdue, decimal strings. */
  totals: { open: string; overdue: string }
  /** Invoiced orders waiting for the finance confirmation. */
  pending: PendingInvoicedOrder[]
  /** Whether the user may confirm them (`credit:approve`). */
  canConfirm: boolean
}

/**
 * Where clause of a receivables filter.
 *
 * @param filter - Chosen filter.
 * @param now - Reference time.
 * @returns The where clause.
 */
function filterWhere(
  filter: ReceivableFilter,
  now: Date
): Prisma.ReceivableWhereInput {
  switch (filter) {
    case "OPEN":
      return { status: "OPEN", dueDate: { gte: now } }
    case "OVERDUE":
      return { status: "OPEN", dueDate: { lt: now } }
    case "PAID":
      return { status: "PAID" }
    case "CANCELED":
      return { status: "CANCELED" }
    default:
      return {}
  }
}

/**
 * Lists the installments of the invoiced orders with their due dates
 * and settlements (RF33), the totals to receive and the invoiced orders
 * waiting for the finance confirmation. Requires `payment:refund` (the
 * finance module); the user comes from the session.
 *
 * @param input - Filter and search by order, company or boleto number.
 * @returns `{ success: true, receivables }` or `{ success: false, error }`.
 */
export async function listReceivables(
  input: ReceivablesFilterInput = {}
): Promise<ActionResult<{ receivables: ReceivablesData }>> {
  try {
    const parsed = receivablesFilterSchema.safeParse(input)
    if (!parsed.success) throw new AppError("Filtro inválido.", "invalid")
    const { permissions } = await requirePermission("payment:refund")
    const { filter, search } = parsed.data
    const now = new Date()

    const [rows, open, overdue, pendingOrders] = await Promise.all([
      prisma.receivable.findMany({
        where: {
          ...filterWhere(filter, now),
          ...(search
            ? {
                OR: [
                  {
                    boletoNumber: {
                      contains: search.replace(/\D/g, "") || search,
                    },
                  },
                  { order: { number: { contains: search } } },
                  { order: { organization: { name: { contains: search } } } },
                ],
              }
            : {}),
        },
        orderBy: [{ dueDate: "asc" }, { sequence: "asc" }],
        take: LIST_LIMIT,
        select: {
          id: true,
          orderId: true,
          sequence: true,
          dueDays: true,
          amount: true,
          dueDate: true,
          status: true,
          boletoNumber: true,
          digitableLine: true,
          paidAt: true,
          paidAmount: true,
          settlementMethod: true,
          settlementNote: true,
          settledBy: { select: { name: true } },
          order: {
            select: {
              number: true,
              user: { select: { name: true } },
              organization: { select: { name: true } },
              _count: { select: { receivables: true } },
            },
          },
        },
      }),
      prisma.receivable.aggregate({
        where: { status: "OPEN" },
        _sum: { amount: true },
      }),
      prisma.receivable.aggregate({
        where: { status: "OPEN", dueDate: { lt: now } },
        _sum: { amount: true },
      }),
      prisma.order.findMany({
        where: { paymentMethod: "INVOICED", status: "AWAITING_PAYMENT" },
        orderBy: { createdAt: "asc" },
        take: 50,
        select: {
          id: true,
          number: true,
          total: true,
          createdAt: true,
          organizationId: true,
          organization: { select: { name: true } },
        },
      }),
    ])

    const pending: PendingInvoicedOrder[] = []
    for (const order of pendingOrders) {
      pending.push({
        id: order.id,
        number: order.number,
        company: order.organization?.name ?? null,
        total: order.total.toFixed(2),
        createdAt: order.createdAt.toISOString(),
        credit: order.organizationId
          ? await loadCreditPosition(prisma, order.organizationId, order.id)
          : null,
      })
    }

    return {
      success: true,
      receivables: {
        rows: rows.map((row) => ({
          id: row.id,
          orderId: row.orderId,
          orderNumber: row.order.number,
          company: row.order.organization?.name ?? null,
          customer: row.order.user.name,
          sequence: row.sequence,
          count: row.order._count.receivables,
          dueDays: row.dueDays,
          amount: row.amount.toFixed(2),
          dueDate: row.dueDate.toISOString(),
          state: installmentState(row.status, row.dueDate, now),
          boletoNumber: row.boletoNumber,
          digitableLine: row.digitableLine,
          settlement:
            row.status === "PAID" && row.paidAt
              ? {
                  paidAt: row.paidAt.toISOString(),
                  paidAmount: (row.paidAmount ?? row.amount).toFixed(2),
                  method: row.settlementMethod ?? "MANUAL",
                  by: row.settledBy?.name ?? null,
                  note: row.settlementNote,
                }
              : null,
        })),
        totals: {
          open: open._sum.amount?.toFixed(2) ?? "0.00",
          overdue: overdue._sum.amount?.toFixed(2) ?? "0.00",
        },
        pending,
        canConfirm: hasPermission(permissions, "credit:approve"),
      },
    }
  } catch (error) {
    return toActionError(error, { action: "listReceivables" })
  }
}

/**
 * Records the settlement of an installment (RF33): manual or confirmed
 * by the bank return. Requires `payment:refund`, with the user from the
 * session. In one transaction it locks the installment, refuses one
 * already settled or canceled, a payment below the amount or in the
 * future, stores who settled it, when, how much and how, and writes the
 * audit log (RNF12). The settled amount gives the credit back (RN10).
 *
 * @param input - Installment, payment date, paid amount, method and note.
 * @returns `{ success: true, orderNumber }` or `{ success: false, error }`.
 */
export async function settleInstallment(
  input: SettleInstallmentInput
): Promise<ActionResult<{ orderNumber: string; sequence: number }>> {
  try {
    const parsed = settleInstallmentSchema.safeParse(input)
    if (!parsed.success) {
      throw new AppError(
        parsed.error.issues[0]?.message ?? "Revise a baixa.",
        "invalid"
      )
    }
    const data = parsed.data
    const { user } = await requirePermission("payment:refund")
    const now = new Date()
    const paidAt = new Date(`${data.paidAt}T12:00:00-03:00`)
    if (paidAt.getTime() > now.getTime() + 12 * 60 * 60 * 1000) {
      throw new AppError(
        "A data do pagamento não pode estar no futuro.",
        "future_date"
      )
    }

    const result = await prisma.$transaction(async (tx) => {
      // Justified raw query: Prisma has no row lock
      await tx.$queryRaw`SELECT id FROM invoiced_installments WHERE id = ${data.installmentId} FOR UPDATE`
      const installment = await tx.receivable.findUnique({
        where: { id: data.installmentId },
        select: {
          id: true,
          orderId: true,
          sequence: true,
          amount: true,
          status: true,
          order: { select: { number: true, status: true } },
        },
      })
      if (!installment) {
        throw new AppError("Parcela não encontrada.", "not_found")
      }
      if (installment.status !== "OPEN") {
        throw new AppError(
          installment.status === "PAID"
            ? "Esta parcela já foi baixada."
            : "Esta parcela foi cancelada com o pedido.",
          "not_open"
        )
      }
      if (
        CREDIT_RELEASED_STATUSES.includes(
          installment.order.status as OrderStatusKey
        )
      ) {
        throw new AppError(
          "O pedido desta parcela foi cancelado ou estornado.",
          "order_closed"
        )
      }
      if (toCents(data.paidAmount) < toCents(installment.amount.toFixed(2))) {
        throw new AppError(
          `O valor pago é menor que o da parcela (${brl.format(Number(installment.amount))}). Baixa parcial não é aceita.`,
          "partial_payment"
        )
      }
      await tx.receivable.update({
        where: { id: installment.id },
        data: {
          status: "PAID",
          paidAt,
          paidAmount: data.paidAmount,
          settledById: user.id,
          settlementMethod: data.method,
          settlementNote: data.note || null,
        },
      })
      await writeAudit(tx, {
        userId: user.id,
        action: "installment.settle",
        entity: "invoiced_installment",
        entityId: installment.id,
        before: { status: installment.status },
        after: {
          status: "PAID",
          orderId: installment.orderId,
          sequence: installment.sequence,
          amount: installment.amount.toFixed(2),
          paidAmount: data.paidAmount,
          paidAt: paidAt.toISOString(),
          method: data.method,
          note: data.note || null,
        },
      })
      return {
        orderNumber: installment.order.number,
        sequence: installment.sequence,
      }
    })
    return { success: true, ...result }
  } catch (error) {
    return toActionError(error, { action: "settleInstallment" })
  }
}

/**
 * Confirms an invoiced order that is waiting for the finance team, e.g.
 * after the shipping quote of the sales team (RN13, RN17): requires
 * `credit:approve`, checks again the credit of the company (RN10) and
 * moves the order to "paid", which writes off the stock and creates the
 * own boletos due in 28 and 56 days (RF33). Audited (RNF12).
 *
 * @param input - Order id.
 * @returns `{ success: true, number }` or `{ success: false, error }`.
 */
export async function confirmInvoicedOrder(
  input: ConfirmInvoicedOrderInput
): Promise<ActionResult<{ number: string }>> {
  try {
    const parsed = confirmInvoicedOrderSchema.safeParse(input)
    if (!parsed.success) throw new AppError("Pedido inválido.", "invalid")
    const { orderId } = parsed.data
    const { user } = await requirePermission("credit:approve")

    const number = await prisma.$transaction(async (tx) => {
      const order = await tx.order.findFirst({
        where: { id: orderId, paymentMethod: "INVOICED" },
        select: { id: true, organizationId: true, total: true },
      })
      if (!order)
        throw new AppError("Pedido faturado não encontrado.", "not_found")
      await assertInvoicedCredit(tx, {
        organizationId: order.organizationId,
        amount: order.total.toFixed(2),
        excludeOrderId: order.id,
      })
      const transition = await transitionOrder(tx, {
        orderId: order.id,
        to: "PAID",
        changedById: user.id,
        note: "Pedido faturado confirmado pelo financeiro.",
        expectedFrom: ["AWAITING_PAYMENT"],
        unexpectedMessage:
          "Este pedido não aguarda a confirmação do financeiro. Atualize a página.",
      })
      await writeAudit(tx, {
        userId: user.id,
        action: "order.invoiced_confirm",
        entity: "order",
        entityId: order.id,
        before: { status: transition.from },
        after: { status: transition.to, total: order.total.toFixed(2) },
      })
      return transition.number
    })
    return { success: true, number }
  } catch (error) {
    return toActionError(error, { action: "confirmInvoicedOrder" })
  }
}
