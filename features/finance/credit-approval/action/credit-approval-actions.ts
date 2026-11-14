"use server"

import {
  updateCreditSchema,
  type UpdateCreditInput,
} from "@/features/finance/credit-approval/schema/credit-approval-schema"
import {
  creditPosition,
  type CreditPosition,
  type CreditStatusKey,
} from "@/features/shared/lib/credit/credit-math"
import { loadCreditUsage } from "@/features/shared/lib/credit/credit-service"
import { writeAudit } from "@/features/shared/lib/db/audit"
import { requirePermission } from "@/features/shared/lib/db/permissions"
import { prisma } from "@/features/shared/lib/db/prisma"
import {
  AppError,
  toActionError,
  type ActionResult,
} from "@/features/shared/lib/errors/action-result"

/** How many history entries each account shows. */
const HISTORY_SIZE = 20

/** How many accounts the page lists. */
const ACCOUNTS_LIMIT = 200

/** One change of the credit of an account (RF58). */
export type CreditChangeEntry = {
  /** Entry id. */
  id: string
  /** Status before, or null for the first record. */
  previousStatus: CreditStatusKey | null
  /** Status after. */
  status: CreditStatusKey
  /** Limit before, decimal string. */
  previousLimit: string | null
  /** Limit after, decimal string. */
  newLimit: string | null
  /** Who changed it. */
  changedBy: string
  /** When, ISO string. */
  at: string
  /** Justification. */
  note: string | null
}

/** A corporate account in the credit desk. */
export type CreditAccount = {
  /** Account id. */
  id: string
  /** Trade name. */
  name: string
  /** Legal name, if known. */
  legalName: string | null
  /** CNPJ, digits only. */
  cnpj: string | null
  /** Credit position (status, limit, used and available). */
  credit: CreditPosition
  /** Changes of status and limit, newest first. */
  history: CreditChangeEntry[]
}

/**
 * Lists the corporate accounts with their credit position and the
 * history of changes (RF58, RN10). Requires `credit:approve`; the user
 * comes from the session.
 *
 * @returns `{ success: true, accounts }` or `{ success: false, error }`.
 */
export async function listCreditAccounts(): Promise<
  ActionResult<{ accounts: CreditAccount[] }>
> {
  try {
    await requirePermission("credit:approve")
    const rows = await prisma.organization.findMany({
      where: { deletedAt: null },
      orderBy: { name: "asc" },
      take: ACCOUNTS_LIMIT,
      select: {
        id: true,
        name: true,
        legalName: true,
        cnpj: true,
        creditStatus: true,
        creditLimit: true,
        creditLimitChanges: {
          orderBy: { createdAt: "desc" },
          take: HISTORY_SIZE,
          select: {
            id: true,
            previousStatus: true,
            status: true,
            previousLimit: true,
            newLimit: true,
            note: true,
            createdAt: true,
            changedBy: { select: { name: true } },
          },
        },
      },
    })
    const usage = await loadCreditUsage(
      prisma,
      rows.map((row) => row.id)
    )
    return {
      success: true,
      accounts: rows.map((row) => ({
        id: row.id,
        name: row.name,
        legalName: row.legalName,
        cnpj: row.cnpj,
        credit: creditPosition({
          status: row.creditStatus,
          limit: row.creditLimit?.toFixed(2) ?? null,
          used: usage.get(row.id) ?? "0.00",
        }),
        history: row.creditLimitChanges.map((change) => ({
          id: change.id,
          previousStatus: change.previousStatus,
          status: change.status,
          previousLimit: change.previousLimit?.toFixed(2) ?? null,
          newLimit: change.newLimit?.toFixed(2) ?? null,
          changedBy: change.changedBy.name,
          at: change.createdAt.toISOString(),
          note: change.note,
        })),
      })),
    }
  } catch (error) {
    return toActionError(error, { action: "listCreditAccounts" })
  }
}

/**
 * Approves, refuses or puts back under review the invoiced purchase of
 * a corporate account and sets its credit limit (RF58, RN03, RN10).
 * Requires `credit:approve`, with the user from the session. In one
 * transaction it locks the account, updates the status and the limit,
 * appends the change to the history (who, when, before, after and why)
 * and writes the audit log (RNF12). A limit below the credit in use is
 * allowed: it blocks new invoiced orders until the open ones are paid.
 *
 * @param input - Account, decision, limit and justification.
 * @returns `{ success: true, credit }` or `{ success: false, error }`.
 */
export async function updateCorporateCredit(
  input: UpdateCreditInput
): Promise<ActionResult<{ credit: CreditPosition }>> {
  try {
    const parsed = updateCreditSchema.safeParse(input)
    if (!parsed.success) {
      throw new AppError(
        parsed.error.issues[0]?.message ?? "Revise a decisão de crédito.",
        "invalid"
      )
    }
    const data = parsed.data
    const { user } = await requirePermission("credit:approve")
    const now = new Date()

    const credit = await prisma.$transaction(async (tx) => {
      // Justified raw query: Prisma has no row lock
      await tx.$queryRaw`SELECT id FROM organizations WHERE id = ${data.organizationId} FOR UPDATE`
      const account = await tx.organization.findFirst({
        where: { id: data.organizationId, deletedAt: null },
        select: { id: true, creditStatus: true, creditLimit: true },
      })
      if (!account) {
        throw new AppError("Conta corporativa não encontrada.", "not_found")
      }
      const previousLimit = account.creditLimit?.toFixed(2) ?? null
      if (
        account.creditStatus === data.status &&
        previousLimit === data.limit
      ) {
        throw new AppError(
          "Nada mudou: a conta já está com esta situação e este limite.",
          "unchanged"
        )
      }
      await tx.organization.update({
        where: { id: account.id },
        data: { creditStatus: data.status, creditLimit: data.limit },
      })
      const change = await tx.creditLimitChange.create({
        data: {
          organizationId: account.id,
          previousStatus: account.creditStatus,
          previousLimit,
          newLimit: data.limit,
          status: data.status,
          changedById: user.id,
          note: data.note || null,
          createdAt: now,
        },
        select: { id: true },
      })
      await writeAudit(tx, {
        userId: user.id,
        action: "credit.update",
        entity: "organization",
        entityId: account.id,
        before: {
          creditStatus: account.creditStatus,
          creditLimit: previousLimit,
        },
        after: {
          creditStatus: data.status,
          creditLimit: data.limit,
          changeId: change.id,
          note: data.note || null,
        },
      })
      const usage = await loadCreditUsage(tx, [account.id])
      return creditPosition({
        status: data.status,
        limit: data.limit,
        used: usage.get(account.id) ?? "0.00",
      })
    })
    return { success: true, credit }
  } catch (error) {
    return toActionError(error, { action: "updateCorporateCredit" })
  }
}
