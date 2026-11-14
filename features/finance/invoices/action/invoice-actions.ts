"use server"

import type { Prisma } from "@/generated/prisma/client"
import {
  invoiceFileSchema,
  invoicesFilterSchema,
  reprocessInvoiceSchema,
  type InvoiceFileInput,
  type InvoiceFilter,
  type InvoicesFilterInput,
  type ReprocessInvoiceInput,
} from "@/features/finance/invoices/schema/invoice-schema"
import { writeAudit } from "@/features/shared/lib/db/audit"
import { requirePermission } from "@/features/shared/lib/db/permissions"
import { prisma } from "@/features/shared/lib/db/prisma"
import {
  AppError,
  toActionError,
  type ActionResult,
} from "@/features/shared/lib/errors/action-result"
import {
  processInvoice,
  type InvoiceRunOutcome,
  type InvoiceStatusKey,
} from "@/features/shared/lib/nfe/nfe-service"
import { readStoredFile } from "@/features/shared/lib/storage/storage"

/** How many NF-e the list shows. */
const LIST_LIMIT = 100

/** An NF-e in the back office list. */
export type InvoiceRow = {
  /** NF-e id. */
  id: string
  /** Order id. */
  orderId: string
  /** Readable order number. */
  orderNumber: string
  /** Company or customer. */
  customer: string
  /** Status. */
  status: InvoiceStatusKey
  /** Access key, once issued. */
  accessKey: string | null
  /** NF-e number and series, once issued. */
  number: string | null
  series: string | null
  /** Failed attempts. */
  attempts: number
  /** Last failure, safe to show. */
  lastError: string | null
  /** Next automatic attempt, ISO string. */
  nextAttemptAt: string | null
  /** When it was issued, ISO string. */
  issuedAt: string | null
  /** When it was queued, ISO string. */
  createdAt: string
  /** Whether the XML and the DANFE are stored. */
  hasXml: boolean
  hasDanfe: boolean
}

/** What the NF-e page shows. */
export type InvoicesData = {
  /** NF-e of the filter, newest first. */
  rows: InvoiceRow[]
  /** How many failed (the alert of the page). */
  failed: number
  /** How many wait for the issuer. */
  inProgress: number
}

/**
 * Where clause of an NF-e filter.
 *
 * @param filter - Chosen filter.
 * @returns The where clause.
 */
function filterWhere(filter: InvoiceFilter): Prisma.InvoiceWhereInput {
  switch (filter) {
    case "FAILED":
      return { status: "FAILED" }
    case "IN_PROGRESS":
      return { status: { in: ["PENDING", "PROCESSING"] } }
    case "ISSUED":
      return { status: "ISSUED" }
    default:
      return {}
  }
}

/**
 * Lists the NF-e of the orders with their status, access key, failures
 * and next attempt (RF13). Requires `invoice:manage`; the user comes
 * from the session.
 *
 * @param input - Filter and order number search.
 * @returns `{ success: true, invoices }` or `{ success: false, error }`.
 */
export async function listInvoices(
  input: InvoicesFilterInput = {}
): Promise<ActionResult<{ invoices: InvoicesData }>> {
  try {
    const parsed = invoicesFilterSchema.safeParse(input)
    if (!parsed.success) throw new AppError("Filtro inválido.", "invalid")
    await requirePermission("invoice:manage")
    const { filter, search } = parsed.data
    const [rows, failed, inProgress] = await Promise.all([
      prisma.invoice.findMany({
        where: {
          ...filterWhere(filter),
          ...(search ? { order: { number: { contains: search } } } : {}),
        },
        orderBy: { createdAt: "desc" },
        take: LIST_LIMIT,
        select: {
          id: true,
          orderId: true,
          status: true,
          accessKey: true,
          number: true,
          series: true,
          attempts: true,
          lastError: true,
          nextAttemptAt: true,
          issuedAt: true,
          createdAt: true,
          danfeKey: true,
          xml: false,
          order: {
            select: {
              number: true,
              user: { select: { name: true } },
              organization: { select: { name: true } },
            },
          },
        },
      }),
      prisma.invoice.count({ where: { status: "FAILED" } }),
      prisma.invoice.count({
        where: { status: { in: ["PENDING", "PROCESSING"] } },
      }),
    ])
    return {
      success: true,
      invoices: {
        rows: rows.map((row) => ({
          id: row.id,
          orderId: row.orderId,
          orderNumber: row.order.number,
          customer: row.order.organization?.name ?? row.order.user.name,
          status: row.status,
          accessKey: row.accessKey,
          number: row.number,
          series: row.series,
          attempts: row.attempts,
          lastError: row.lastError,
          nextAttemptAt: row.nextAttemptAt?.toISOString() ?? null,
          issuedAt: row.issuedAt?.toISOString() ?? null,
          createdAt: row.createdAt.toISOString(),
          hasXml: row.status === "ISSUED",
          hasDanfe: row.danfeKey !== null,
        })),
        failed,
        inProgress,
      },
    }
  } catch (error) {
    return toActionError(error, { action: "listInvoices" })
  }
}

/**
 * Reprocesses an NF-e by hand (RF13): after the data was fixed, or to
 * not wait for the next automatic attempt. Requires `invoice:manage`,
 * with the user from the session; audited (RNF12). An issued NF-e is
 * never sent again.
 *
 * @param input - NF-e id.
 * @returns `{ success: true, status, message }` or
 * `{ success: false, error }`.
 */
export async function reprocessInvoice(
  input: ReprocessInvoiceInput
): Promise<ActionResult<InvoiceRunOutcome>> {
  try {
    const parsed = reprocessInvoiceSchema.safeParse(input)
    if (!parsed.success) throw new AppError("NF-e inválida.", "invalid")
    const { invoiceId } = parsed.data
    const { user } = await requirePermission("invoice:manage")
    const now = new Date()
    await prisma.$transaction(async (tx) => {
      const result = await tx.invoice.updateMany({
        where: {
          id: invoiceId,
          status: { in: ["PENDING", "PROCESSING", "FAILED"] },
        },
        data: { nextAttemptAt: now, alertedAt: null },
      })
      if (result.count === 0) {
        throw new AppError(
          "Esta NF-e já foi emitida ou não existe. Atualize a página.",
          "not_reprocessable"
        )
      }
      await writeAudit(tx, {
        userId: user.id,
        action: "invoice.reprocess",
        entity: "invoice",
        entityId: invoiceId,
      })
    })
    const outcome = await processInvoice(invoiceId, {
      now,
      userId: user.id,
      manual: true,
    })
    return { success: true, ...outcome }
  } catch (error) {
    return toActionError(error, { action: "reprocessInvoice" })
  }
}

/**
 * Reads the XML or the DANFE of an issued NF-e for the back office
 * download (RF13). Requires `invoice:manage`; the files hold personal
 * data, so they are never public (LGPD).
 *
 * @param input - NF-e id and which file.
 * @returns `{ success: true, file }` or `{ success: false, error }`.
 */
export async function loadInvoiceFile(input: InvoiceFileInput): Promise<
  ActionResult<{
    file: { name: string; contentType: string; data: Buffer }
  }>
> {
  try {
    const parsed = invoiceFileSchema.safeParse(input)
    if (!parsed.success) throw new AppError("Arquivo inválido.", "invalid")
    await requirePermission("invoice:manage")
    const invoice = await prisma.invoice.findUnique({
      where: { id: parsed.data.invoiceId },
      select: {
        status: true,
        accessKey: true,
        xml: parsed.data.kind === "xml",
        danfeKey: true,
      },
    })
    if (!invoice || invoice.status !== "ISSUED" || !invoice.accessKey) {
      throw new AppError("NF-e não encontrada.", "not_found")
    }
    if (parsed.data.kind === "xml") {
      if (!invoice.xml) throw new AppError("XML não encontrado.", "not_found")
      return {
        success: true,
        file: {
          name: `nfe-${invoice.accessKey}.xml`,
          contentType: "application/xml; charset=utf-8",
          data: Buffer.from(invoice.xml, "utf8"),
        },
      }
    }
    const data = invoice.danfeKey
      ? await readStoredFile(invoice.danfeKey)
      : null
    if (!data) throw new AppError("DANFE não encontrado.", "not_found")
    return {
      success: true,
      file: {
        name: `danfe-${invoice.accessKey}.pdf`,
        contentType: "application/pdf",
        data,
      },
    }
  } catch (error) {
    return toActionError(error, { action: "loadInvoiceFile" })
  }
}
