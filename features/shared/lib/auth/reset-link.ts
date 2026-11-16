/**
 * Link sent by e-mail to reset the password (RF40). It opens the store
 * page `/redefinir-senha` with the one-time token; the app does not
 * expose the Better Auth HTTP routes, so its default link would not
 * work.
 *
 * @param baseUrl - Public URL of the store (BETTER_AUTH_URL).
 * @param token - One-time reset token.
 * @returns Absolute URL of the reset page.
 */
export function passwordResetLink(
  baseUrl: string | undefined,
  token: string
): string {
  const base = (baseUrl || "http://localhost:3000").replace(/\/+$/, "")
  return `${base}/redefinir-senha?token=${encodeURIComponent(token)}`
}
