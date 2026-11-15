"use server"

import type { Prisma } from "@/generated/prisma/client"
import { supportTicketEmail } from "@/emails/templates"
import {
  supportDeskTicketSchema,
  supportQueueSchema,
  supportTicketUpdateSchema,
  type SupportDeskTicketInput,
  type SupportQueueFilter,
  type SupportQueueInput,
} from "@/features/after-sales/support-desk/schema/support-desk-schema"
import { writeAudit } from "@/features/shared/lib/db/audit"
import { requirePermission } from "@/features/shared/lib/db/permissions"
import { prisma } from "@/features/shared/lib/db/prisma"
import { enqueueEmail } from "@/features/shared/lib/email/mailer"
import { siteUrl } from "@/features/shared/lib/email/site-url"
import {
  AppError,
  toActionError,
  type ActionResult,
} from "@/features/shared/lib/errors/action-result"
import {
  readQuoteAttachment,
  type AttachmentDownload,
} from "@/features/shared/lib/quotes/quote-access"
import { TICKET_NOT_FOUND_MESSAGE } from "@/features/shared/lib/support/ticket-access"
import {
  ticketDetailSelect,
  toTicketDetail,
  type TicketDetail,
} from "@/features/shared/lib/support/ticket-detail"
import {
  discardTicketFiles,
  readTicketFiles,
  storeTicketFiles,
  ticketAttachmentRows,
} from "@/features/shared/lib/support/ticket-files"
import {
  canChangeTicketStatus,
  FINAL_TICKET_STATUSES,
  isFinalTicketStatus,
  OPEN_TICKET_STATUSES,
  TICKET_STATUS,
  type TicketKindKey,
  type TicketStatusKey,
} from "@/features/shared/lib/support/ticket-status"
import {
  supportAttachmentSchema,
  type SupportAttachmentInput,
} from "@/features/shared/schema/support-attachments-schema"

/** A ticket of the back office queue. */
export type SupportQueueRow = {
  /** Ticket id. */
  id: string
  /** Readable number. */
  number: string
  /** Kind. */
  kind: TicketKindKey
  /** Status. */
  status: TicketStatusKey
  /** Summary. */
  subject: string
  /** Customer name. */
  customer: string
  /** Corporate account, if any. */
  company: string | null
  /** Order number. */
  orderNumber: string
  /** Product name. */
  itemName: string
  /** Opening date, ISO string. */
  createdAt: string
  /** Last change, ISO string. */
  updatedAt: string
}

/**
 * Status filter of the queue.
 *
 * @param filter - Queue filter.
 * @returns The Prisma where clause.
 */
function filterWhere(
  filter: SupportQueueFilter
): Prisma.SupportTicketWhereInput {
  if (filter === "OPEN") return { status: { in: [...OPEN_TICKET_STATUSES] } }
  if (filter === "WAITING_CUSTOMER") return { status: "WAITING_CUSTOMER" }
  if (filter === "FINISHED") {
    return { status: { in: [...FINAL_TICKET_STATUSES] } }
  }
  return {}
}

/**
 * Parses the JSON payload of the answer form.
 *
 * @param formData - Request form data.
 * @returns The raw values, or null.
 */
function readPayload(formData: FormData): unknown {
  const raw = formData.get("payload")
  if (typeof raw !== "string") return null
  try {
    return JSON.parse(raw) as unknown
  } catch {
    return null
  }
}

/**
 * After-sales queue of the back office (RF17): warranty and technical
 * assistance tickets by status, oldest first so nothing waits forever,
 * with a search by ticket, order, customer or e-mail. Needs
 * `support:manage`.
 *
 * @param input - Filter and search.
 * @returns `{ success: true, tickets }` or `{ success: false, error }`.
 */
export async function listSupportQueue(
  input: SupportQueueInput
): Promise<ActionResult<{ tickets: SupportQueueRow[] }>> {
  try {
    const { filter, search } = supportQueueSchema.parse(input ?? {})
    await requirePermission("support:manage")
    const rows = await prisma.supportTicket.findMany({
      where: {
        ...filterWhere(filter),
        ...(search
          ? {
              OR: [
                { number: { contains: search } },
                { order: { number: { contains: search } } },
                { user: { name: { contains: search } } },
                { user: { email: { contains: search } } },
              ],
            }
          : {}),
      },
      orderBy: { createdAt: "asc" },
      take: 200,
      select: {
        id: true,
        number: true,
        kind: true,
        status: true,
        subject: true,
        createdAt: true,
        updatedAt: true,
        user: { select: { name: true } },
        organization: { select: { name: true } },
        order: { select: { number: true } },
        orderItem: { select: { productName: true } },
      },
    })
    return {
      success: true,
      tickets: rows.map((row) => ({
        id: row.id,
        number: row.number,
        kind: row.kind,
        status: row.status,
        subject: row.subject,
        customer: row.user.name,
        company: row.organization?.name ?? null,
        orderNumber: row.order.number,
        itemName: row.orderItem.productName,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
      })),
    }
  } catch (error) {
    return toActionError(error, { action: "listSupportQueue" })
  }
}

/**
 * Loads a ticket for the team (RF17): customer, order and item, the
 * estimated warranty coverage (reference for the evaluation), the
 * timeline and the files. Needs `support:manage`.
 *
 * @param input - Ticket id.
 * @returns `{ success: true, ticket }` or `{ success: false, error }`.
 */
export async function getSupportDeskTicket(
  input: SupportDeskTicketInput
): Promise<ActionResult<{ ticket: TicketDetail }>> {
  try {
    const parsed = supportDeskTicketSchema.safeParse(input)
    if (!parsed.success) throw new AppError("Chamado inválido.", "invalid")
    await requirePermission("support:manage")
    const row = await prisma.supportTicket.findUnique({
      where: { id: parsed.data.ticketId },
      select: ticketDetailSelect,
    })
    if (!row) throw new AppError(TICKET_NOT_FOUND_MESSAGE, "not_found")
    return { success: true, ticket: toTicketDetail(row, "team") }
  } catch (error) {
    return toActionError(error, { action: "getSupportDeskTicket" })
  }
}

/**
 * Answers a ticket (RF17): changes the status along the allowed path,
 * writes a message to the customer and attaches files (report, label).
 * Resolving or denying records the outcome and closes the ticket. In
 * one transaction it guards against a concurrent change, records the
 * timeline step and the files, queues the update e-mail to the customer
 * (RF53: chamados) and writes the audit log (RNF12). Needs
 * `support:manage`.
 *
 * @param formData - `payload` (JSON with ticket, status, message and
 *   resolution) and the `attachments` files.
 * @returns `{ success: true }` or `{ success: false, error }`.
 */
export async function updateSupportTicket(
  formData: FormData
): Promise<ActionResult> {
  const stored: string[] = []
  try {
    const parsed = supportTicketUpdateSchema.safeParse(readPayload(formData))
    if (!parsed.success) {
      throw new AppError(
        parsed.error.issues[0]?.message ?? "Revise a resposta.",
        "invalid"
      )
    }
    const { user } = await requirePermission("support:manage")
    const files = await readTicketFiles(formData)
    const data = parsed.data

    const ticket = await prisma.supportTicket.findUnique({
      where: { id: data.ticketId },
      select: {
        id: true,
        number: true,
        status: true,
        user: { select: { name: true, email: true } },
      },
    })
    if (!ticket) throw new AppError(TICKET_NOT_FOUND_MESSAGE, "not_found")
    if (isFinalTicketStatus(ticket.status)) {
      throw new AppError("Este chamado já foi encerrado.", "ticket_closed")
    }
    const next = data.status || ticket.status
    const statusChanged = next !== ticket.status
    if (statusChanged && !canChangeTicketStatus(ticket.status, next)) {
      throw new AppError(
        `O chamado não pode passar de “${TICKET_STATUS[ticket.status].label}” para “${TICKET_STATUS[next].label}”.`,
        "invalid_transition"
      )
    }
    const closing = statusChanged && isFinalTicketStatus(next)

    await storeTicketFiles(files, stored)
    const now = new Date()
    await prisma.$transaction(async (tx) => {
      const changed = await tx.supportTicket.updateMany({
        where: { id: ticket.id, status: ticket.status },
        data: {
          status: next,
          ...(closing ? { resolution: data.resolution, closedAt: now } : {}),
        },
      })
      if (changed.count === 0) {
        throw new AppError(
          "O chamado mudou enquanto você respondia. Recarregue a página.",
          "stale"
        )
      }
      await tx.supportTicketEvent.create({
        data: {
          ticketId: ticket.id,
          fromStatus: statusChanged ? ticket.status : null,
          toStatus: statusChanged ? next : null,
          message: data.message || null,
          authorId: user.id,
          fromTeam: true,
          createdAt: now,
        },
      })
      if (files.length > 0) {
        await tx.supportTicketAttachment.createMany({
          data: ticketAttachmentRows(files, true).map((row) => ({
            ...row,
            ticketId: ticket.id,
          })),
        })
      }
      const email = supportTicketEmail({
        name: ticket.user.name,
        number: ticket.number,
        status: TICKET_STATUS[next].label,
        message: closing
          ? `${TICKET_STATUS[next].description} ${data.resolution}`
          : data.message ||
            "A situação do seu chamado mudou. Confira os detalhes no site.",
        url: `${siteUrl()}/conta/chamados/${ticket.id}`,
      })
      await enqueueEmail(tx, { to: ticket.user.email, ...email }, now)
      await writeAudit(tx, {
        userId: user.id,
        action: "support_ticket.update",
        entity: "support_ticket",
        entityId: ticket.id,
        before: { status: ticket.status },
        after: {
          status: next,
          message: Boolean(data.message),
          resolution: closing ? data.resolution : undefined,
          attachments: files.length,
        },
      })
    })
    return { success: true }
  } catch (error) {
    await discardTicketFiles(stored)
    return toActionError(error, { action: "updateSupportTicket" })
  }
}

/**
 * Downloads a photo or document of a ticket for the team. Needs
 * `support:manage`.
 *
 * @param input - Attachment id.
 * @returns `{ success: true, file }` or `{ success: false, error }`.
 */
export async function downloadSupportDeskAttachment(
  input: SupportAttachmentInput
): Promise<ActionResult<{ file: AttachmentDownload }>> {
  try {
    const parsed = supportAttachmentSchema.safeParse(input)
    if (!parsed.success) throw new AppError("Arquivo inválido.", "invalid")
    await requirePermission("support:manage")
    const attachment = await prisma.supportTicketAttachment.findUnique({
      where: { id: parsed.data.attachmentId },
      select: { name: true, mimeType: true, storageKey: true },
    })
    if (!attachment) throw new AppError("Arquivo não encontrado.", "not_found")
    return { success: true, file: await readQuoteAttachment(attachment) }
  } catch (error) {
    return toActionError(error, { action: "downloadSupportDeskAttachment" })
  }
}
