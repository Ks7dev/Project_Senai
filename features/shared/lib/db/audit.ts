import "server-only"
import type { Prisma } from "@/generated/prisma/client"

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
}

/**
 * Writes an audit log row inside the same transaction as the change,
 * so the log and the data never diverge (RNF12). The log is append
 * only: no screen edits or deletes it.
 *
 * @param tx - Prisma transaction client.
 * @param entry - What changed and who changed it.
 */
export async function writeAudit(
  tx: Prisma.TransactionClient,
  entry: AuditEntry
): Promise<void> {
  await tx.auditLog.create({
    data: {
      userId: entry.userId,
      action: entry.action,
      entity: entry.entity,
      entityId: entry.entityId,
      before: toJson(entry.before),
      after: toJson(entry.after),
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
