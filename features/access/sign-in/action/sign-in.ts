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
import {
  enforcePersistentRateLimits,
  releasePersistentRateLimit,
  type RateLimitCheck,
} from "@/features/shared/lib/rate-limit/persistent-limit"

const INVALID_CREDENTIALS = "E-mail ou senha incorretos."

/** Name of the Better Auth cookie of a pending 2FA login, unprefixed. */
const TWO_FACTOR_COOKIE = "better-auth.two_factor"

/**
 * Signed value of the pending 2FA login cookie (plain or `__Secure-`),
 * which identifies one login challenge.
 *
 * @param requestHeaders - Headers of the current request.
 * @returns The cookie value, or null when there is no pending login.
 */
function twoFactorChallenge(requestHeaders: Headers): string | null {
  for (const part of (requestHeaders.get("cookie") ?? "").split(";")) {
    const separator = part.indexOf("=")
    if (separator < 0) continue
    const name = part.slice(0, separator).trim()
    if (
      name === TWO_FACTOR_COOKIE ||
      name === `__Secure-${TWO_FACTOR_COOKIE}`
    ) {
      return part.slice(separator + 1).trim() || null
    }
  }
  return null
}

/**
 * Logs in with e-mail and password (RF39). When the account has 2FA
 * enabled, the session is only created after the code (RF40). The
 * visitor cart joins the account cart on login (RF07). Every attempt is
 * counted per normalized e-mail in the database before the password is
 * checked and given back when the password is right (SEC-005, #220), so
 * only failures add up, a distributed attack is stopped whatever the IP
 * and the refusal is the same whether the account exists.
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

    // The schema already trims and lowercases the e-mail
    const accountLimit: RateLimitCheck = {
      scope: "auth.account",
      subject: parsed.data.email,
    }
    await enforcePersistentRateLimits([accountLimit], {
      userId: null,
      action: "signIn",
    })

    const result = await getAuth()
      .api.signInEmail({ headers: await headers(), body: parsed.data })
      .catch((error: unknown) => {
        if (isAPIError(error)) throw new AppError(INVALID_CREDENTIALS, "denied")
        throw error
      })

    // The password was right: this attempt is not a failure
    await releasePersistentRateLimit(accountLimit)

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
 * (RF40). Each code tried is counted per login challenge in the
 * database (SEC-005, #220); a new challenge needs the password again,
 * which is limited per e-mail, so guessing codes stays bounded.
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
    const requestHeaders = await headers()
    const challenge = twoFactorChallenge(requestHeaders)
    // Without the cookie Better Auth refuses the code by itself
    if (challenge) {
      await enforcePersistentRateLimits(
        [{ scope: "auth.totp", subject: challenge }],
        { userId: null, action: "verifyTwoFactor" }
      )
    }
    const result = await getAuth()
      .api.verifyTOTP({ headers: requestHeaders, body: parsed.data })
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
