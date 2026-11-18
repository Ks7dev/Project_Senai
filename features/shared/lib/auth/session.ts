import "server-only"
import { headers } from "next/headers"
import { getAuth } from "@/features/shared/lib/auth/auth"

/** Logged-in user, as read from the session cookie. */
export type SessionUser = {
  /** User id (from the session, never from the request body). */
  id: string
  /** Display name. */
  name: string
  /** Login e-mail. */
  email: string
  /** Whether the account has 2FA turned on (RF40). */
  twoFactorEnabled: boolean
  /** Whether this session was opened with the 2FA code (#177). */
  twoFactorVerified: boolean
}

/**
 * Reads the current user from the Better Auth session cookie. Reads the
 * request, so callers in components must sit behind `<Suspense>`.
 *
 * @returns The user, or null when nobody is logged in.
 */
export async function getCurrentUser(): Promise<SessionUser | null> {
  // Read the request first: it marks the render as dynamic before the
  // auth instance (and its database client) is created.
  const requestHeaders = await headers()
  const session = await getAuth().api.getSession({ headers: requestHeaders })
  if (!session) return null
  const { id, name, email } = session.user
  return {
    id,
    name,
    email,
    twoFactorEnabled: session.user.twoFactorEnabled === true,
    twoFactorVerified: session.session.twoFactorVerified === true,
  }
}
