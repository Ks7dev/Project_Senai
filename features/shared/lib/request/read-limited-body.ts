/** Result of reading a request body with a byte ceiling. */
export type LimitedBody =
  { ok: true; text: string } | { ok: false; reason: "too_large" }

/**
 * Reads a request body as UTF-8 text, streaming it and stopping as soon
 * as it passes `maxBytes` (SEC-006, #220). The `Content-Length` header
 * is only a shortcut: a chunked body without it is still cut at the
 * ceiling, so a single request cannot fill the server memory.
 *
 * @param request - Incoming request.
 * @param maxBytes - Largest body accepted, in bytes.
 * @returns The text, or `{ ok: false, reason: "too_large" }`.
 */
export async function readLimitedText(
  request: Request,
  maxBytes: number
): Promise<LimitedBody> {
  const declared = Number(request.headers.get("content-length"))
  if (Number.isFinite(declared) && declared > maxBytes) {
    await request.body?.cancel().catch(() => undefined)
    return { ok: false, reason: "too_large" }
  }
  if (!request.body) return { ok: true, text: "" }

  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > maxBytes) {
      await reader.cancel().catch(() => undefined)
      return { ok: false, reason: "too_large" }
    }
    chunks.push(value)
  }

  const bytes = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  return { ok: true, text: new TextDecoder().decode(bytes) }
}
