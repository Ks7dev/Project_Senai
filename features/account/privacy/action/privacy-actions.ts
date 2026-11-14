"use server"

import { headers } from "next/headers"
import { isAPIError } from "better-auth/api"
import {
  deleteMyDataSchema,
  type DeleteMyDataInput,
} from "@/features/account/privacy/schema/privacy-schema"
import { getAuth } from "@/features/shared/lib/auth/auth"
import { getCurrentUser } from "@/features/shared/lib/auth/session"
import { writeAudit } from "@/features/shared/lib/db/audit"
import { UNAUTHENTICATED_MESSAGE } from "@/features/shared/lib/db/permissions"
import { prisma } from "@/features/shared/lib/db/prisma"
import {
  AppError,
  toActionError,
  type ActionResult,
} from "@/features/shared/lib/errors/action-result"
import {
  anonymizeUser,
  buildPersonalDataExport,
} from "@/features/shared/lib/privacy/personal-data"
import type { DownloadedFile } from "@/features/shared/lib/quotes/save-download"
import { enforceActionRateLimit } from "@/features/shared/lib/rate-limit/action-limit"

/**
 * Exports the personal data of the logged-in customer in a readable
 * format (RF56): a JSON file with Portuguese labels. The titular comes
 * from the session, never from the request.
 *
 * @returns `{ success: true, file }` or `{ success: false, error }`.
 */
export async function exportMyData(): Promise<
  ActionResult<{ file: DownloadedFile }>
> {
  try {
    const user = await getCurrentUser()
    if (!user) throw new AppError(UNAUTHENTICATED_MESSAGE, "unauthenticated")
    await enforceActionRateLimit("privacy-export", {
      limit: 5,
      windowMs: 60_000,
    })
    const data = await buildPersonalDataExport(user.id)
    await prisma.$transaction((tx) =>
      writeAudit(tx, {
        userId: user.id,
        action: "privacy.export",
        entity: "user",
        entityId: user.id,
        after: { requestedBy: "titular" },
      })
    )
    const day = new Date().toISOString().slice(0, 10)
    return {
      success: true,
      file: {
        name: `meus-dados-atelier-bureau-${day}.json`,
        mimeType: "application/json",
        data: Buffer.from(JSON.stringify(data, null, 2), "utf8").toString(
          "base64"
        ),
      },
    }
  } catch (error) {
    return toActionError(error, { action: "exportMyData" })
  }
}

/**
 * Deletes the personal data of the logged-in customer by anonymization
 * (RF56): the password is checked again, orders and invoices stay
 * linked to the anonymized account and every session ends. Recorded in
 * the audit log without personal data (RNF12).
 *
 * @param input - Current password and confirmation phrase.
 * @returns `{ success: true }` or `{ success: false, error }`.
 */
export async function deleteMyData(
  input: DeleteMyDataInput
): Promise<ActionResult> {
  try {
    const parsed = deleteMyDataSchema.safeParse(input)
    if (!parsed.success) {
      throw new AppError(
        parsed.error.issues[0]?.message ?? "Confirme a exclusão.",
        "invalid"
      )
    }
    const user = await getCurrentUser()
    if (!user) throw new AppError(UNAUTHENTICATED_MESSAGE, "unauthenticated")
    await enforceActionRateLimit("privacy-delete", {
      limit: 5,
      windowMs: 60_000,
    })
    await getAuth()
      .api.verifyPassword({
        headers: await headers(),
        body: { password: parsed.data.password },
      })
      .catch((error: unknown) => {
        if (isAPIError(error)) {
          throw new AppError("Senha incorreta.", "bad_password")
        }
        throw error
      })
    await prisma.$transaction(async (tx) => {
      const removed = await anonymizeUser(tx, user.id)
      await writeAudit(tx, {
        userId: user.id,
        action: "privacy.anonymize",
        entity: "user",
        entityId: user.id,
        after: { requestedBy: "titular", removed },
      })
    })
    return { success: true }
  } catch (error) {
    return toActionError(error, { action: "deleteMyData" })
  }
}
