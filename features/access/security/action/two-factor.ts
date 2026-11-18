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
import { requiresTwoFactor } from "@/features/shared/lib/auth/permissions"
import { getCurrentUser } from "@/features/shared/lib/auth/session"
import { prisma } from "@/features/shared/lib/db/prisma"
import {
  loadUserPermissions,
  UNAUTHENTICATED_MESSAGE,
} from "@/features/shared/lib/db/permissions"
import {
  AppError,
  toActionError,
  type ActionResult,
} from "@/features/shared/lib/errors/action-result"

/** Who may use 2FA and whether their profile makes it mandatory. */
type TwoFactorAccess = {
  /** Whether the user belongs to a corporate account. */
  corporate: boolean
  /** Whether the user has an internal (back office) profile. */
  internal: boolean
  /** Whether 2FA is mandatory for the profile (#177). */
  required: boolean
}

/**
 * Reads how 2FA applies to a user: offered to corporate accounts
 * (RF40) and to internal profiles, and mandatory for the profiles that
 * access orders, payments or refunds (#177).
 *
 * @param userId - User id, from the session.
 * @returns The 2FA access of the user.
 */
async function loadTwoFactorAccess(userId: string): Promise<TwoFactorAccess> {
  const [member, permissions] = await Promise.all([
    prisma.member.findFirst({ where: { userId }, select: { id: true } }),
    loadUserPermissions(userId),
  ])
  return {
    corporate: Boolean(member),
    internal: permissions.size > 0,
    required: requiresTwoFactor(permissions),
  }
}

/**
 * Ensures the logged-in user may use 2FA: corporate accounts (RF40) and
 * internal profiles (#177).
 *
 * @returns The user id and their 2FA access.
 */
async function requireTwoFactorUser(): Promise<
  { userId: string } & TwoFactorAccess
> {
  const user = await getCurrentUser()
  if (!user) throw new AppError(UNAUTHENTICATED_MESSAGE, "unauthenticated")
  const access = await loadTwoFactorAccess(user.id)
  if (!access.corporate && !access.internal) {
    throw new AppError(
      "A verificação em duas etapas está disponível para contas corporativas.",
      "not_corporate"
    )
  }
  return { userId: user.id, ...access }
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
export type SecurityStatus = TwoFactorAccess & {
  /** Whether 2FA is on. */
  twoFactorEnabled: boolean
  /** Whether the current session was opened with the 2FA code. */
  sessionVerified: boolean
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
  const access = await loadTwoFactorAccess(user.id)
  return {
    ...access,
    twoFactorEnabled: user.twoFactorEnabled,
    sessionVerified: user.twoFactorVerified,
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
    await requireTwoFactorUser()
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
    await requireTwoFactorUser()
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
 * Turns 2FA off after confirming the password. Refused for profiles
 * where 2FA is mandatory (#177).
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
    const { required } = await requireTwoFactorUser()
    // Profiles with access to orders, payments or refunds keep 2FA (#177)
    if (required) {
      throw new AppError(
        "A verificação em duas etapas é obrigatória para o seu perfil e não pode ser desativada.",
        "two_factor_required"
      )
    }
    await getAuth()
      .api.disableTwoFactor({ headers: await headers(), body: parsed.data })
      .catch(passwordError)
    return { success: true }
  } catch (error) {
    return toActionError(error, { action: "disableTwoFactor" })
  }
}
