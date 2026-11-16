/**
 * Public address of the store, for links in e-mails (BETTER_AUTH_URL).
 *
 * @returns The base URL without a trailing slash.
 */
export function siteUrl(): string {
  return (process.env.BETTER_AUTH_URL ?? "http://localhost:3000").replace(
    /\/$/,
    ""
  )
}
