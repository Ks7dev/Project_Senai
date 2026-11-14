"use server"

import type { Prisma } from "@/generated/prisma/client"
import {
  AUDIT_PAGE_SIZE,
  auditLogFiltersSchema,
  type AuditLogFiltersInput,
} from "@/features/backoffice/audit-log/schema/audit-log-schema"
import { requirePermission } from "@/features/shared/lib/db/permissions"
import { prisma } from "@/features/shared/lib/db/prisma"
import {
  AppError,
  toActionError,
  type ActionResult,
} from "@/features/shared/lib/errors/action-result"

/** Offset of São Paulo from UTC (no daylight saving since 2019). */
const SAO_PAULO_OFFSET = "-03:00"

/** One row of the audit log, ready for the screen. */
export type AuditLogRow = {
  /** Row id. */
  id: string
  /** When it happened, ISO string (UTC). */
  createdAt: string
  /** Who did it, or null for the system (webhook, scheduled job). */
  user: { name: string; email: string } | null
  /** Client IP, or null when unknown. */
  ipAddress: string | null
  /** Action name, e.g. "order.approve". */
  action: string
  /** Affected entity, e.g. "order". */
  entity: string
  /** Affected row id. */
  entityId: string | null
  /** Values before the change, as indented JSON, or null. */
  before: string | null
  /** Values after the change, as indented JSON, or null. */
  after: string | null
}

/**
 * Indents a JSON column for reading.
 *
 * @param value - Stored JSON.
 * @returns The text, or null when empty.
 */
function formatJson(value: Prisma.JsonValue | null): string | null {
  if (value === null || value === undefined) return null
  return JSON.stringify(value, null, 2)
}

/**
 * Lists the audit log for the back office (#76, RNF12), newest first,
 * filtered by area, action, user, affected id and period. Read only:
 * there is no action that edits or deletes a row. Requires
 * `audit:read`.
 *
 * @param input - Filters, as read from the URL.
 * @returns `{ success: true, rows, hasNext, page }` or
 * `{ success: false, error }`.
 */
export async function listAuditLogs(input: AuditLogFiltersInput): Promise<
  ActionResult<{
    rows: AuditLogRow[]
    page: number
    hasNext: boolean
  }>
> {
  try {
    const parsed = auditLogFiltersSchema.safeParse(input)
    if (!parsed.success) {
      throw new AppError(
        parsed.error.issues[0]?.message ?? "Filtro inválido.",
        "invalid"
      )
    }
    await requirePermission("audit:read")
    const filters = parsed.data

    const where: Prisma.AuditLogWhereInput = {}
    if (filters.entity) where.entity = filters.entity
    if (filters.action) where.action = { startsWith: filters.action }
    if (filters.entityId) where.entityId = filters.entityId
    if (filters.user) {
      where.user = {
        OR: [
          { email: { contains: filters.user } },
          { name: { contains: filters.user } },
        ],
      }
    }
    if (filters.from || filters.to) {
      where.createdAt = {
        ...(filters.from
          ? { gte: new Date(`${filters.from}T00:00:00${SAO_PAULO_OFFSET}`) }
          : {}),
        ...(filters.to
          ? { lte: new Date(`${filters.to}T23:59:59.999${SAO_PAULO_OFFSET}`) }
          : {}),
      }
    }

    const rows = await prisma.auditLog.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: (filters.page - 1) * AUDIT_PAGE_SIZE,
      take: AUDIT_PAGE_SIZE + 1,
      select: {
        id: true,
        createdAt: true,
        ipAddress: true,
        action: true,
        entity: true,
        entityId: true,
        before: true,
        after: true,
        user: { select: { name: true, email: true } },
      },
    })

    return {
      success: true,
      page: filters.page,
      hasNext: rows.length > AUDIT_PAGE_SIZE,
      rows: rows.slice(0, AUDIT_PAGE_SIZE).map((row) => ({
        id: row.id,
        createdAt: row.createdAt.toISOString(),
        user: row.user,
        ipAddress: row.ipAddress,
        action: row.action,
        entity: row.entity,
        entityId: row.entityId,
        before: formatJson(row.before),
        after: formatJson(row.after),
      })),
    }
  } catch (error) {
    return toActionError(error, { action: "listAuditLogs" })
  }
}
