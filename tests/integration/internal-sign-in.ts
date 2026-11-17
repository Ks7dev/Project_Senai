import { base32 } from "@better-auth/utils/base32"
import { createOTP } from "@better-auth/utils/otp"
import { expect } from "vitest"
import { accounts } from "@/prisma/seed-data"
import { headers, jar } from "./next-headers-stub"

/**
 * Seed accounts with an internal profile. All of them read orders, so
 * mandatory 2FA applies to them in the back office (#177).
 */
export const INTERNAL_SEED_EMAILS: ReadonlySet<string> = new Set(
  accounts
    .filter((account) => (account.roles ?? []).length > 0)
    .map((account) => account.email)
)

/** Accounts whose 2FA was turned on by these tests, reset at the end. */
const enrolled = new Set<string>()

/**
 * Turns 2FA off for an account straight in the database, dropping any
 * TOTP secret, so the next enrollment starts clean.
 *
 * @param email - Account e-mail.
 */
async function clearTwoFactor(email: string) {
  const { prisma } = await import("@/features/shared/lib/db/prisma")
  await prisma.twoFactor.deleteMany({ where: { user: { email } } })
  await prisma.user.update({
    where: { email },
    data: { twoFactorEnabled: false },
  })
}

/**
 * Logs in with an internal seed account and leaves a session verified
 * with 2FA, as the back office requires (#177). Uses the real sign-in
 * action, turns 2FA on through the Better Auth API and confirms it with
 * a TOTP code generated from the secret; Better Auth then issues a new
 * session, flagged as verified by the session hook. 2FA is reset first,
 * so the account never depends on a secret from an earlier run.
 *
 * @param email - Internal seed account e-mail.
 * @param password - Seed password.
 * @returns The session user, with 2FA on and verified.
 */
export async function signInInternalWithTwoFactor(
  email: string,
  password: string
) {
  const { getAuth } = await import("@/features/shared/lib/auth/auth")
  const { signIn } = await import("@/features/access/sign-in/action/sign-in")
  const { getCurrentUser } = await import("@/features/shared/lib/auth/session")

  await clearTwoFactor(email)
  enrolled.add(email)
  jar.clear()
  expect(await signIn({ email, password })).toEqual({
    success: true,
    twoFactor: false,
  })

  const api = getAuth().api
  const enabled = await api.enableTwoFactor({
    headers: await headers(),
    body: { password },
  })
  if (enabled.method !== "totp") throw new Error("Expected TOTP 2FA")
  const secret = new URL(enabled.totpURI).searchParams.get("secret")
  if (!secret) throw new Error("TOTP URI without secret")
  const code = await createOTP(base32.decode(secret)).totp()
  await api.verifyTOTP({ headers: await headers(), body: { code } })

  const user = await getCurrentUser()
  expect(user).toMatchObject({
    email,
    twoFactorEnabled: true,
    twoFactorVerified: true,
  })
  return user!
}

/**
 * Logs in with any seed account: internal accounts go through
 * `signInInternalWithTwoFactor`, the others through the plain sign-in.
 *
 * @param email - Seed account e-mail.
 * @param password - Seed password.
 */
export async function signInSeedAccount(email: string, password: string) {
  if (INTERNAL_SEED_EMAILS.has(email)) {
    await signInInternalWithTwoFactor(email, password)
    return
  }
  const { signIn } = await import("@/features/access/sign-in/action/sign-in")
  jar.clear()
  expect(await signIn({ email, password })).toEqual({
    success: true,
    twoFactor: false,
  })
}

/**
 * Turns 2FA back off for every account enrolled by these tests, so the
 * seed accounts keep logging in with the seed password alone (call it in
 * `afterAll`, before disconnecting Prisma).
 */
export async function resetInternalTwoFactor() {
  for (const email of enrolled) await clearTwoFactor(email)
  enrolled.clear()
}
