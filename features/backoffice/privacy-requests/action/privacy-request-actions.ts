"use server"

import {
  privacyAnonymizeSchema,
  privacyLookupSchema,
  privacySubjectSchema,
  type PrivacyAnonymizeInput,
  type PrivacyLookupInput,
  type PrivacySubjectInput,
} from "@/features/backoffice/privacy-requests/schema/privacy-request-schema"
import { writeAudit } from "@/features/shared/lib/db/audit"
import { requirePermission } from "@/features/shared/lib/db/permissions"
import { prisma } from "@/features/shared/lib/db/prisma"
import {
  AppError,
  toActionError,
  type ActionResult,
} from "@/features/shared/lib/errors/action-result"
import {
  anonymizeUser,
  buildPersonalDataExport,
  CLOSED_ORDER_STATUSES,
} from "@/features/shared/lib/privacy/personal-data"
import type { DownloadedFile } from "@/features/shared/lib/quotes/save-download"

/** A titular found in the search. */
export type PrivacySubject = {
  /** User id. */
  id: string
  /** Name. */
  name: string
  /** Login e-mail. */
  email: string
  /** PF or PJ. */
  personType: "PF" | "PJ"
  /** Orders placed. */
  orders: number
  /** Orders still in course. */
  openOrders: number
  /** When the account was anonymized, ISO string, or null. */
  anonymizedAt: string | null
}

/**
 * Finds titulars by e-mail or CPF/CNPJ to answer a request received by
 * the service channel (RF56). Only `privacy:manage` profiles see it.
 *
 * @param input - E-mail or document.
 * @returns `{ success: true, subjects }` or `{ success: false, error }`.
 */
export async function findPrivacySubjects(
  input: PrivacyLookupInput
): Promise<ActionResult<{ subjects: PrivacySubject[] }>> {
  try {
    const parsed = privacyLookupSchema.safeParse(input)
    if (!parsed.success) {
      throw new AppError(
        parsed.error.issues[0]?.message ?? "Busca inválida.",
        "invalid"
      )
    }
    await requirePermission("privacy:manage")
    const query = parsed.data.query
    const digits = query.replace(/\D/g, "")
    const where = query.includes("@")
      ? { email: query.toLowerCase() }
      : digits.length === 11 || digits.length === 14
        ? { document: digits }
        : null
    if (!where) {
      throw new AppError(
        "Informe um e-mail ou um CPF/CNPJ completo.",
        "invalid_query"
      )
    }
    const users = await prisma.user.findMany({
      where,
      take: 5,
      select: {
        id: true,
        name: true,
        email: true,
        personType: true,
        deletedAt: true,
        orders: { select: { status: true } },
      },
    })
    return {
      success: true,
      subjects: users.map((user) => ({
        id: user.id,
        name: user.name,
        email: user.email,
        personType: user.personType,
        orders: user.orders.length,
        openOrders: user.orders.filter(
          (order) => !CLOSED_ORDER_STATUSES.includes(order.status)
        ).length,
        anonymizedAt: user.deletedAt?.toISOString() ?? null,
      })),
    }
  } catch (error) {
    return toActionError(error, { action: "findPrivacySubjects" })
  }
}

/**
 * Exports the personal data of a titular for a request received by the
 * service channel (RF56). The export is audited (RNF12).
 *
 * @param input - Titular id.
 * @returns `{ success: true, file }` or `{ success: false, error }`.
 */
export async function exportSubjectData(
  input: PrivacySubjectInput
): Promise<ActionResult<{ file: DownloadedFile }>> {
  try {
    const parsed = privacySubjectSchema.safeParse(input)
    if (!parsed.success) throw new AppError("Titular inválido.", "invalid")
    const { user } = await requirePermission("privacy:manage")
    const data = await buildPersonalDataExport(parsed.data.userId)
    await prisma.$transaction((tx) =>
      writeAudit(tx, {
        userId: user.id,
        action: "privacy.export",
        entity: "user",
        entityId: parsed.data.userId,
        after: { requestedBy: "dpo" },
      })
    )
    const day = new Date().toISOString().slice(0, 10)
    return {
      success: true,
      file: {
        name: `dados-titular-${day}.json`,
        mimeType: "application/json",
        data: Buffer.from(JSON.stringify(data, null, 2), "utf8").toString(
          "base64"
        ),
      },
    }
  } catch (error) {
    return toActionError(error, { action: "exportSubjectData" })
  }
}

/**
 * Anonymizes a titular at their request (RF56), keeping orders and
 * invoices. Refused while an order is in course. Audited with the
 * protocol of the request and without personal data (RNF12).
 *
 * @param input - Titular id, protocol and confirmation.
 * @returns `{ success: true }` or `{ success: false, error }`.
 */
export async function anonymizeSubject(
  input: PrivacyAnonymizeInput
): Promise<ActionResult> {
  try {
    const parsed = privacyAnonymizeSchema.safeParse(input)
    if (!parsed.success) {
      throw new AppError(
        parsed.error.issues[0]?.message ?? "Confirme a anonimização.",
        "invalid"
      )
    }
    const { user } = await requirePermission("privacy:manage")
    if (parsed.data.userId === user.id) {
      throw new AppError(
        "Para excluir os seus próprios dados, use a área do cliente.",
        "self"
      )
    }
    await prisma.$transaction(async (tx) => {
      const removed = await anonymizeUser(tx, parsed.data.userId)
      await writeAudit(tx, {
        userId: user.id,
        action: "privacy.anonymize",
        entity: "user",
        entityId: parsed.data.userId,
        after: {
          requestedBy: "dpo",
          protocol: parsed.data.protocol,
          removed,
        },
      })
    })
    return { success: true }
  } catch (error) {
    return toActionError(error, { action: "anonymizeSubject" })
  }
}
