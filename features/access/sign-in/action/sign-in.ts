"use server"

import { headers } from "next/headers"
import { isAPIError } from "better-auth/api"
import {
  signInSchema,
  type SignInInput,
} from "@/features/access/sign-in/schema/sign-in-schema"
import {
  twoFactorCodeSchema,
  type TwoFactorCodeInput,
} from "@/features/shared/schema/two-factor-code-schema"
import { getAuth } from "@/features/shared/lib/auth/auth"
import { mergeGuestCartAfterLogin } from "@/features/shared/lib/cart/cart-store"
import {
  AppError,
  toActionError,
  type ActionResult,
} from "@/features/shared/lib/errors/action-result"

const INVALID_CREDENTIALS = "E-mail ou senha incorretos."

/**
 * Logs in with e-mail and password (RF39). When the account has 2FA
 * enabled, the session is only created after the code (RF40). The
 * visitor cart joins the account cart on login (RF07).
 *
 * @param input - Login form values, revalidated here with Zod.
 * @returns `{ success: true, twoFactor }` or `{ success: false, error }`.
 */
export async function signIn(
  input: SignInInput
): Promise<ActionResult<{ twoFactor: boolean }>> {
  try {
    const parsed = signInSchema.safeParse(input)
    if (!parsed.success) throw new AppError(INVALID_CREDENTIALS, "invalid")

    const result = await getAuth()
      .api.signInEmail({ headers: await headers(), body: parsed.data })
      .catch((error: unknown) => {
        if (isAPIError(error)) throw new AppError(INVALID_CREDENTIALS, "denied")
        throw error
      })

    const twoFactor =
      "twoFactorRedirect" in result && result.twoFactorRedirect === true
    // The visitor cart is kept after login (#46, RF07)
    if (!twoFactor && "user" in result) {
      await mergeGuestCartAfterLogin(result.user.id)
    }
    return { success: true, twoFactor }
  } catch (error) {
    return toActionError(error, { action: "signIn" })
  }
}

/**
 * Completes a login that requires 2FA with the authenticator code
 * (RF40).
 *
 * @param input - Six-digit code.
 * @returns `{ success: true }` or `{ success: false, error }`.
 */
export async function verifyTwoFactor(
  input: TwoFactorCodeInput
): Promise<ActionResult> {
  try {
    const parsed = twoFactorCodeSchema.safeParse(input)
    if (!parsed.success) {
      throw new AppError("Código inválido.", "invalid_code")
    }
    const result = await getAuth()
      .api.verifyTOTP({ headers: await headers(), body: parsed.data })
      .catch((error: unknown) => {
        if (isAPIError(error)) {
          throw new AppError(
            "Código incorreto ou expirado. Tente o código atual do aplicativo.",
            "invalid_code"
          )
        }
        throw error
      })
    // The visitor cart is kept after login (#46, RF07)
    await mergeGuestCartAfterLogin(result.user.id)
    return { success: true }
  } catch (error) {
    return toActionError(error, { action: "verifyTwoFactor" })
  }
}

/**
 * Ends the current session.
 *
 * @returns `{ success: true }` or `{ success: false, error }`.
 */
export async function signOut(): Promise<ActionResult> {
  try {
    await getAuth().api.signOut({ headers: await headers() })
    return { success: true }
  } catch (error) {
    return toActionError(error, { action: "signOut" })
  }
}
