import "server-only"
import { headers } from "next/headers"
import { REQUEST_ID_HEADER } from "@/features/shared/lib/request/request-id-header"

/**
 * Reads the request id set by `proxy.ts` for the current request, so
 * logs from Server Actions can be correlated with the proxy logs.
 *
 * @returns The request id, or `undefined` outside a request scope.
 */
export async function getRequestId(): Promise<string | undefined> {
  try {
    return (await headers()).get(REQUEST_ID_HEADER) ?? undefined
  } catch {
    return undefined
  }
}
