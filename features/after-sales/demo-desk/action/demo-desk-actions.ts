"use server"

import { demoCustomerEmail } from "@/emails/templates"
import {
  demoDecisionSchema,
  demoDeskQuerySchema,
  type DemoDecisionInput,
  type DemoDeskQueryInput,
} from "@/features/after-sales/demo-desk/schema/demo-desk-schema"
import { writeAudit } from "@/features/shared/lib/db/audit"
import { requirePermission } from "@/features/shared/lib/db/permissions"
import { prisma } from "@/features/shared/lib/db/prisma"
import {
  DEMO_MODE_LABEL,
  DEMO_STATUS_LABEL,
  formatDemoDate,
  nextDemoStatuses,
  type DemoModeKey,
  type DemoStatusKey,
} from "@/features/shared/lib/demos/demo-calendar"
import { enqueueEmail } from "@/features/shared/lib/email/mailer"
import { siteUrl } from "@/features/shared/lib/email/site-url"
import {
  AppError,
  toActionError,
  type ActionResult,
} from "@/features/shared/lib/errors/action-result"

/** A demonstration request of the back office. */
export type DemoDeskRow = {
  /** Request id. */
  id: string
  /** Start, ISO string. */
  scheduledAt: string
  /** Format. */
  mode: DemoModeKey
  /** Status. */
  status: DemoStatusKey
  /** Customer name and e-mail. */
  customer: { name: string; email: string }
  /** Phone for the contact, digits. */
  phone: string | null
  /** Corporate account, if any. */
  company: string | null
  /** Product, if any. */
  product: string | null
  /** Seller who received it. */
  seller: string | null
  /** Notes of the customer. */
  notes: string | null
  /** Message of the team. */
  teamNote: string | null
  /** Next statuses the team may set. */
  next: DemoStatusKey[]
}

/**
 * Demonstration requests received by the sales team (RF19): upcoming
 * ones (requested or confirmed) by date, or all of them. Needs
 * `support:manage`.
 *
 * @param input - Filter.
 * @returns `{ success: true, requests }` or `{ success: false, error }`.
 */
export async function listDemoRequests(
  input: DemoDeskQueryInput
): Promise<ActionResult<{ requests: DemoDeskRow[] }>> {
  try {
    const { filter } = demoDeskQuerySchema.parse(input ?? {})
    await requirePermission("support:manage")
    const rows = await prisma.demoRequest.findMany({
      where:
        filter === "UPCOMING"
          ? {
              status: { in: ["REQUESTED", "CONFIRMED"] },
              scheduledAt: { gte: new Date(Date.now() - 12 * 60 * 60 * 1000) },
            }
          : {},
      orderBy: { scheduledAt: filter === "UPCOMING" ? "asc" : "desc" },
      take: 200,
      select: {
        id: true,
        scheduledAt: true,
        mode: true,
        status: true,
        phone: true,
        notes: true,
        teamNote: true,
        user: { select: { name: true, email: true } },
        organization: { select: { name: true } },
        product: { select: { name: true } },
        seller: { select: { name: true } },
      },
    })
    return {
      success: true,
      requests: rows.map((row) => ({
        id: row.id,
        scheduledAt: row.scheduledAt.toISOString(),
        mode: row.mode,
        status: row.status,
        customer: row.user,
        phone: row.phone,
        company: row.organization?.name ?? null,
        product: row.product?.name ?? null,
        seller: row.seller?.name ?? null,
        notes: row.notes,
        teamNote: row.teamNote,
        next: [...nextDemoStatuses(row.status)],
      })),
    }
  } catch (error) {
    return toActionError(error, { action: "listDemoRequests" })
  }
}

/**
 * Confirms, cancels or closes a demonstration (RF19). Cancelling needs a
 * message to the customer. Confirmations and cancellations e-mail the
 * customer (RF53); every change writes the audit log (RNF12). Needs
 * `support:manage`.
 *
 * @param input - Request, new status and message.
 * @returns `{ success: true }` or `{ success: false, error }`.
 */
export async function updateDemoRequest(
  input: DemoDecisionInput
): Promise<ActionResult> {
  try {
    const parsed = demoDecisionSchema.safeParse(input)
    if (!parsed.success) {
      throw new AppError(
        parsed.error.issues[0]?.message ?? "Revise a decisão.",
        "invalid"
      )
    }
    const { user } = await requirePermission("support:manage")
    const data = parsed.data
    await prisma.$transaction(async (tx) => {
      const request = await tx.demoRequest.findUnique({
        where: { id: data.requestId },
        select: {
          id: true,
          status: true,
          mode: true,
          scheduledAt: true,
          user: { select: { name: true, email: true } },
          product: { select: { name: true } },
        },
      })
      if (!request)
        throw new AppError("Solicitação não encontrada.", "not_found")
      if (!nextDemoStatuses(request.status).includes(data.status)) {
        throw new AppError(
          `A demonstração não pode passar de “${DEMO_STATUS_LABEL[request.status]}” para “${DEMO_STATUS_LABEL[data.status]}”.`,
          "invalid_transition"
        )
      }
      const changed = await tx.demoRequest.updateMany({
        where: { id: request.id, status: request.status },
        data: { status: data.status, teamNote: data.note || null },
      })
      if (changed.count === 0) {
        throw new AppError(
          "A solicitação mudou enquanto você respondia. Recarregue a página.",
          "stale"
        )
      }
      if (data.status === "CONFIRMED" || data.status === "CANCELED") {
        await enqueueEmail(tx, {
          to: request.user.email,
          ...demoCustomerEmail({
            name: request.user.name,
            stage: data.status === "CONFIRMED" ? "confirmed" : "canceled",
            when: formatDemoDate(request.scheduledAt.toISOString()),
            mode: DEMO_MODE_LABEL[request.mode],
            product: request.product?.name ?? null,
            note: data.note || null,
            url: `${siteUrl()}/demonstracao`,
          }),
        })
      }
      await writeAudit(tx, {
        userId: user.id,
        action: "demo_request.update",
        entity: "demo_request",
        entityId: request.id,
        before: { status: request.status },
        after: { status: data.status, note: data.note || null },
      })
    })
    return { success: true }
  } catch (error) {
    return toActionError(error, { action: "updateDemoRequest" })
  }
}
