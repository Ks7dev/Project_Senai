"use server"

import { headers } from "next/headers"
import { isAPIError } from "better-auth/api"
import {
  requestResetSchema,
  resetPasswordSchema,
  type RequestResetInput,
  type ResetPasswordInput,
} from "@/features/access/password-reset/schema/password-reset-schema"
import { getAuth } from "@/features/shared/lib/auth/auth"
import {
  AppError,
  toActionError,
  type ActionResult,
} from "@/features/shared/lib/errors/action-result"

/**
 * Sends a password reset link (RF40). Always answers the same way, so
 * the form does not reveal which e-mails have an account.
 *
 * @param input - E-mail typed by the user.
 * @returns `{ success: true }` or `{ success: false, error }`.
 */
export async function requestPasswordReset(
  input: RequestResetInput
): Promise<ActionResult> {
  try {
    const parsed = requestResetSchema.safeParse(input)
    if (!parsed.success) throw new AppError("E-mail inválido.", "invalid")
    await getAuth().api.requestPasswordReset({
      headers: await headers(),
      body: { email: parsed.data.email, redirectTo: "/redefinir-senha" },
    })
    return { success: true }
  } catch (error) {
    return toActionError(error, { action: "requestPasswordReset" })
  }
}

/**
 * Sets a new password with the e-mailed token. The token expires in one
 * hour and cannot be reused (RF40); other sessions are revoked.
 *
 * @param input - Token and new password.
 * @returns `{ success: true }` or `{ success: false, error }`.
 */
export async function resetPassword(
  input: ResetPasswordInput
): Promise<ActionResult> {
  try {
    const parsed = resetPasswordSchema.safeParse(input)
    if (!parsed.success) {
      throw new AppError("Revise os dados do formulário.", "invalid")
    }
    await getAuth()
      .api.resetPassword({
        headers: await headers(),
        body: {
          token: parsed.data.token,
          newPassword: parsed.data.password,
        },
      })
      .catch((error: unknown) => {
        if (isAPIError(error)) {
          throw new AppError(
            "Este link expirou ou já foi usado. Peça um novo link.",
            "invalid_token"
          )
        }
        throw error
      })
    return { success: true }
  } catch (error) {
    return toActionError(error, { action: "resetPassword" })
  }
}
