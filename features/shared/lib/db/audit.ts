import "server-only"
import type { Prisma } from "@/generated/prisma/client"
import { getClientIp } from "@/features/shared/lib/request/client-ip"

/** A sensitive action to record (RNF12). */
export type AuditEntry = {
  /**
   * User who performed the action (from the session), or null for the
   * system (payment webhook, reconciliation job).
   */
  userId: string | null
  /** Action name in English, e.g. "category.update". */
  action: string
  /** Affected entity, e.g. "category". */
  entity: string
  /** Affected row id. */
  entityId?: string
  /** Values before the change. */
  before?: unknown
  /** Values after the change. */
  after?: unknown
  /**
   * Client IP. When omitted it is read from the headers of the current
   * request; null outside a request (scheduled jobs).
   */
  ipAddress?: string | null
}

/**
 * Writes an audit log row inside the same transaction as the change,
 * so the log and the data never diverge (RNF12): who, when (UTC), from
 * which IP and the values before and after. The log is append only: no
 * screen edits or deletes it.
 *
 * @param tx - Prisma transaction client.
 * @param entry - What changed and who changed it.
 */
export async function writeAudit(
  tx: Prisma.TransactionClient,
  entry: AuditEntry
): Promise<void> {
  const ipAddress =
    entry.ipAddress !== undefined ? entry.ipAddress : await getClientIp()
  await tx.auditLog.create({
    data: {
      userId: entry.userId,
      action: entry.action,
      entity: entry.entity,
      entityId: entry.entityId,
      before: toJson(entry.before),
      after: toJson(entry.after),
      ...(ipAddress ? { ipAddress } : {}),
    },
  })
}

/**
 * Serializes values (Decimal, Date) into plain JSON for the log.
 *
 * @param value - Any value.
 * @returns A JSON-safe value, or undefined.
 */
function toJson(value: unknown): Prisma.InputJsonValue | undefined {
  if (value === undefined) return undefined
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue
}
