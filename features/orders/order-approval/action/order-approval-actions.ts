"use server"

import { orderApprovedEmail } from "@/emails/templates"
import {
  orderApprovalSchema,
  type ApprovalDecisionKey,
  type OrderApprovalInput,
} from "@/features/orders/order-approval/schema/order-approval-schema"
import { canDecideOrderApproval } from "@/features/shared/lib/auth/corporate-roles"
import { writeAudit } from "@/features/shared/lib/db/audit"
import { requireCorporatePermission } from "@/features/shared/lib/db/corporate"
import { prisma } from "@/features/shared/lib/db/prisma"
import { enqueueEmail } from "@/features/shared/lib/email/mailer"
import { siteUrl } from "@/features/shared/lib/email/site-url"
import {
  AppError,
  toActionError,
  type ActionResult,
} from "@/features/shared/lib/errors/action-result"
import { transitionOrder } from "@/features/shared/lib/orders/order-lifecycle"
import type { OrderStatusKey } from "@/features/shared/lib/orders/order-status"
import { PAYMENT_METHOD_LABEL } from "@/features/shared/lib/payments/payment-messages"
import { getNumberSetting } from "@/features/shared/lib/settings/settings"

/** Message when the order does not exist or is of another company. */
const NOT_FOUND_MESSAGE = "Pedido não encontrado."

/** Message when the approver placed the order (RN01). */
const SELF_APPROVAL_MESSAGE =
  "O aprovador precisa ser diferente do solicitante. Peça a decisão a outro aprovador da empresa."

/** Message when the order already left the approval. */
const NOT_AWAITING_MESSAGE =
  "Este pedido não aguarda mais aprovação. Atualize a página."

/** How many past decisions the page lists. */
const HISTORY_SIZE = 30

/** An order waiting for the company approval (RF11). */
export type PendingApproval = {
  /** Order id. */
  orderId: string
  /** Readable order number. */
  number: string
  /** Who placed the order. */
  requester: string
  /** Order date, ISO string. */
  createdAt: string
  /** Order total, decimal string. */
  total: string
  /** Shipping total, decimal string. */
  shippingTotal: string
  /** Payment method label. */
  paymentMethod: string
  /** Lines of the order. */
  items: Array<{ id: string; name: string; quantity: number; total: string }>
  /** Whether the logged-in approver may decide (not the requester). */
  canDecide: boolean
}

/** A decision already taken on an order of the company (RF11). */
export type ApprovalRecord = {
  /** Record id. */
  id: string
  /** Order id. */
  orderId: string
  /** Readable order number. */
  number: string
  /** Approved or refused. */
  decision: ApprovalDecisionKey
  /** Who decided. */
  decidedBy: string
  /** Who placed the order. */
  requester: string
  /** When it was decided, ISO string. */
  decidedAt: string
  /** Justification, if any. */
  note: string | null
  /** Order total decided on, decimal string. */
  total: string
}

/** What the approvals page shows. */
export type ApprovalsData = {
  /** Approval limit of the company orders (RN01), decimal string. */
  approvalLimit: string
  /** Orders waiting for a decision, oldest first. */
  pending: PendingApproval[]
  /** Latest decisions of the company, newest first. */
  history: ApprovalRecord[]
}

/**
 * Lists the orders of the company waiting for approval and the latest
 * decisions (RF11, RN01). Only members with the approver role see it,
 * and only orders of their own corporate account; the user comes from
 * the session.
 *
 * @returns `{ success: true, approvals }` or `{ success: false, error }`.
 */
export async function listOrderApprovals(): Promise<
  ActionResult<{ approvals: ApprovalsData }>
> {
  try {
    const context = await requireCorporatePermission("order:approve")
    const [approvalLimit, memberCount, pending, history] = await Promise.all([
      getNumberSetting("order.approval_limit"),
      prisma.member.count({
        where: { organizationId: context.organizationId },
      }),
      prisma.order.findMany({
        where: {
          organizationId: context.organizationId,
          status: "AWAITING_APPROVAL",
        },
        select: {
          id: true,
          number: true,
          userId: true,
          createdAt: true,
          total: true,
          shippingTotal: true,
          paymentMethod: true,
          user: { select: { name: true } },
          items: {
            select: {
              id: true,
              productName: true,
              quantity: true,
              total: true,
            },
          },
        },
        orderBy: { createdAt: "asc" },
        take: 100,
      }),
      prisma.orderApproval.findMany({
        where: { order: { organizationId: context.organizationId } },
        select: {
          id: true,
          orderId: true,
          decision: true,
          note: true,
          orderTotal: true,
          createdAt: true,
          decidedBy: { select: { name: true } },
          order: {
            select: { number: true, user: { select: { name: true } } },
          },
        },
        orderBy: { createdAt: "desc" },
        take: HISTORY_SIZE,
      }),
    ])
    return {
      success: true,
      approvals: {
        approvalLimit: approvalLimit.toFixed(2),
        pending: pending.map((order) => ({
          orderId: order.id,
          number: order.number,
          requester: order.user.name,
          createdAt: order.createdAt.toISOString(),
          total: order.total.toFixed(2),
          shippingTotal: order.shippingTotal.toFixed(2),
          paymentMethod:
            PAYMENT_METHOD_LABEL[order.paymentMethod] ?? order.paymentMethod,
          items: order.items.map((item) => ({
            id: item.id,
            name: item.productName,
            quantity: item.quantity,
            total: item.total.toFixed(2),
          })),
          canDecide: canDecideOrderApproval({
            roles: context.roles,
            isRequester: order.userId === context.user.id,
            memberCount,
          }),
        })),
        history: history.map((record) => ({
          id: record.id,
          orderId: record.orderId,
          number: record.order.number,
          decision: record.decision,
          decidedBy: record.decidedBy.name,
          requester: record.order.user.name,
          decidedAt: record.createdAt.toISOString(),
          note: record.note,
          total: record.orderTotal.toFixed(2),
        })),
      },
    }
  } catch (error) {
    return toActionError(error, { action: "listOrderApprovals" })
  }
}

/**
 * Approves or refuses an order above the approval limit (RF11, RN01).
 * Only an approver of the order's corporate account decides, and never
 * the requester (except in a single-user account, RN08). In one
 * transaction it:
 * 1. moves the order through the life cycle: approved goes to the
 *    payment (or straight to confirmed when invoiced), refused is
 *    canceled and its stock reservation released;
 * 2. records who decided, when and the justification;
 * 3. queues the e-mail to the requester;
 * 4. writes the audit log (RNF12).
 *
 * @param input - Order, decision and justification.
 * @returns `{ success: true, number, status }` or `{ success: false, error }`.
 */
export async function decideOrderApproval(
  input: OrderApprovalInput
): Promise<ActionResult<{ number: string; status: OrderStatusKey }>> {
  try {
    const parsed = orderApprovalSchema.safeParse(input)
    if (!parsed.success) {
      throw new AppError(
        parsed.error.issues[0]?.message ?? "Revise a decisão.",
        "invalid"
      )
    }
    const { orderId, decision } = parsed.data
    const note = parsed.data.note || null
    const context = await requireCorporatePermission("order:approve")
    const approved = decision === "APPROVED"
    const now = new Date()

    const result = await prisma.$transaction(async (tx) => {
      const scoped = await tx.order.findFirst({
        where: { id: orderId, organizationId: context.organizationId },
        select: { id: true, userId: true, paymentMethod: true },
      })
      if (!scoped) throw new AppError(NOT_FOUND_MESSAGE, "not_found")
      const memberCount = await tx.member.count({
        where: { organizationId: context.organizationId },
      })
      if (
        !canDecideOrderApproval({
          roles: context.roles,
          isRequester: scoped.userId === context.user.id,
          memberCount,
        })
      ) {
        throw new AppError(SELF_APPROVAL_MESSAGE, "self_approval")
      }

      const to: OrderStatusKey = !approved
        ? "CANCELED"
        : scoped.paymentMethod === "INVOICED"
          ? "PAID"
          : "AWAITING_PAYMENT"
      const summary = approved
        ? `Aprovado por ${context.user.name}.`
        : `Recusado por ${context.user.name}.`
      // Locks the order row and refuses one that already left the approval
      const transition = await transitionOrder(tx, {
        orderId,
        to,
        changedById: context.user.id,
        note: note ? `${summary} ${note}` : summary,
        expectedFrom: ["AWAITING_APPROVAL"],
        unexpectedMessage: NOT_AWAITING_MESSAGE,
        cancelReason: approved
          ? null
          : `O pedido foi recusado por ${context.user.name}, aprovador da empresa, e os itens reservados voltaram ao estoque. Justificativa: ${note}`,
        now,
      })
      const order = await tx.order.update({
        where: { id: orderId },
        data: approved
          ? {
              approvedById: context.user.id,
              approvedAt: now,
              approvalNote: note,
            }
          : {},
        select: {
          total: true,
          user: { select: { name: true, email: true } },
        },
      })
      const record = await tx.orderApproval.create({
        data: {
          orderId,
          decision,
          decidedById: context.user.id,
          note,
          orderTotal: order.total,
          createdAt: now,
        },
        select: { id: true },
      })
      if (to === "AWAITING_PAYMENT") {
        await enqueueEmail(tx, {
          to: order.user.email,
          ...orderApprovedEmail({
            name: order.user.name,
            number: transition.number,
            total: order.total.toFixed(2),
            url: `${siteUrl()}/conta/pedidos/${orderId}/pagamento`,
            approver: context.user.name,
            note,
          }),
        })
      }
      await writeAudit(tx, {
        userId: context.user.id,
        action: approved ? "order.approve" : "order.reject",
        entity: "order",
        entityId: orderId,
        before: { status: transition.from },
        after: {
          status: to,
          approvalId: record.id,
          requesterId: scoped.userId,
          total: order.total.toFixed(2),
          note,
          decidedAt: now.toISOString(),
        },
      })
      return { number: transition.number, status: to }
    })
    return { success: true, ...result }
  } catch (error) {
    return toActionError(error, { action: "decideOrderApproval" })
  }
}
