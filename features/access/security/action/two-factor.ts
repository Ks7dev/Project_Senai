"use server"

import { headers } from "next/headers"
import { isAPIError } from "better-auth/api"
import {
  passwordConfirmSchema,
  type PasswordConfirmInput,
} from "@/features/access/security/schema/security-schema"
import {
  twoFactorCodeSchema,
  type TwoFactorCodeInput,
} from "@/features/shared/schema/two-factor-code-schema"
import { getAuth } from "@/features/shared/lib/auth/auth"
import { getCurrentUser } from "@/features/shared/lib/auth/session"
import { prisma } from "@/features/shared/lib/db/prisma"
import { UNAUTHENTICATED_MESSAGE } from "@/features/shared/lib/db/permissions"
import {
  AppError,
  toActionError,
  type ActionResult,
} from "@/features/shared/lib/errors/action-result"

/**
 * Ensures the logged-in user belongs to a corporate account: 2FA is
 * offered to corporate accounts (RF40).
 *
 * @returns The user id.
 */
async function requireCorporateUser(): Promise<string> {
  const user = await getCurrentUser()
  if (!user) throw new AppError(UNAUTHENTICATED_MESSAGE, "unauthenticated")
  const member = await prisma.member.findFirst({
    where: { userId: user.id },
    select: { id: true },
  })
  if (!member) {
    throw new AppError(
      "A verificação em duas etapas está disponível para contas corporativas.",
      "not_corporate"
    )
  }
  return user.id
}

/**
 * Converts Better Auth errors on password checks into a user message.
 *
 * @param error - Caught error.
 * @returns Never; always throws.
 */
function passwordError(error: unknown): never {
  if (isAPIError(error)) throw new AppError("Senha incorreta.", "bad_password")
  throw error
}

/** 2FA situation of the logged-in user, for the security page. */
export type SecurityStatus = {
  /** Whether the user belongs to a corporate account. */
  corporate: boolean
  /** Whether 2FA is on. */
  twoFactorEnabled: boolean
}

/**
 * Reads the 2FA situation of the logged-in user. Reads the session, so
 * the page calls it behind `<Suspense>`.
 *
 * @returns The status, or null when nobody is logged in.
 */
export async function getSecurityStatus(): Promise<SecurityStatus | null> {
  const user = await getCurrentUser()
  if (!user) return null
  const [member, account] = await Promise.all([
    prisma.member.findFirst({
      where: { userId: user.id },
      select: { id: true },
    }),
    prisma.user.findUnique({
      where: { id: user.id },
      select: { twoFactorEnabled: true },
    }),
  ])
  return {
    corporate: Boolean(member),
    twoFactorEnabled: account?.twoFactorEnabled === true,
  }
}

/**
 * Starts 2FA activation: returns the authenticator URI and the backup
 * codes. 2FA only turns on after the first code is confirmed.
 *
 * @param input - Current password.
 * @returns `{ success: true, totpUri, backupCodes }` or an error.
 */
export async function startTwoFactor(
  input: PasswordConfirmInput
): Promise<ActionResult<{ totpUri: string; backupCodes: string[] }>> {
  try {
    const parsed = passwordConfirmSchema.safeParse(input)
    if (!parsed.success) throw new AppError("Informe a sua senha.", "invalid")
    await requireCorporateUser()
    const result = await getAuth()
      .api.enableTwoFactor({ headers: await headers(), body: parsed.data })
      .catch(passwordError)
    if (result.method !== "totp") {
      throw new Error("Unexpected 2FA method: TOTP is the only one enabled")
    }
    return {
      success: true,
      totpUri: result.totpURI,
      backupCodes: result.backupCodes,
    }
  } catch (error) {
    return toActionError(error, { action: "startTwoFactor" })
  }
}

/**
 * Confirms the first authenticator code and turns 2FA on.
 *
 * @param input - Six-digit code.
 * @returns `{ success: true }` or `{ success: false, error }`.
 */
export async function confirmTwoFactor(
  input: TwoFactorCodeInput
): Promise<ActionResult> {
  try {
    const parsed = twoFactorCodeSchema.safeParse(input)
    if (!parsed.success) throw new AppError("Código inválido.", "invalid")
    await requireCorporateUser()
    await getAuth()
      .api.verifyTOTP({ headers: await headers(), body: parsed.data })
      .catch((error: unknown) => {
        if (isAPIError(error)) {
          throw new AppError("Código incorreto.", "invalid_code")
        }
        throw error
      })
    return { success: true }
  } catch (error) {
    return toActionError(error, { action: "confirmTwoFactor" })
  }
}

/**
 * Turns 2FA off after confirming the password.
 *
 * @param input - Current password.
 * @returns `{ success: true }` or `{ success: false, error }`.
 */
export async function disableTwoFactor(
  input: PasswordConfirmInput
): Promise<ActionResult> {
  try {
    const parsed = passwordConfirmSchema.safeParse(input)
    if (!parsed.success) throw new AppError("Informe a sua senha.", "invalid")
    await requireCorporateUser()
    await getAuth()
      .api.disableTwoFactor({ headers: await headers(), body: parsed.data })
      .catch(passwordError)
    return { success: true }
  } catch (error) {
    return toActionError(error, { action: "disableTwoFactor" })
  }
}
