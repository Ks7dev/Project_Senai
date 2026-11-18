import "server-only"
import { headers } from "next/headers"
import { NONCE_HEADER } from "@/features/shared/lib/security/headers"

/**
 * Reads the CSP nonce the proxy set for this request (#173). Reading
 * the request headers makes the calling route render at request time,
 * which nonces require.
 *
 * @returns The nonce, or `undefined` outside the payment page.
 */
export async function getRequestNonce(): Promise<string | undefined> {
  return (await headers()).get(NONCE_HEADER) ?? undefined
}
