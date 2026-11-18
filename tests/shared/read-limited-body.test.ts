import { beforeEach, describe, expect, it, vi } from "vitest"
import { readLimitedText } from "@/features/shared/lib/request/read-limited-body"

const processPaymentNotification = vi.fn()

vi.mock("@/features/shared/lib/mercadopago/mercadopago", () => ({
  MercadoPagoError: class MercadoPagoError extends Error {},
  mercadoPagoWebhookSecret: () => "fictitious-webhook-secret",
  verifyWebhookSignature: () => true,
}))
vi.mock("@/features/shared/lib/payments/payment-reconciliation", () => ({
  processPaymentNotification: (input: unknown) =>
    processPaymentNotification(input),
}))

const { POST: cspReport } = await import("@/app/api/csp-report/route")
const { POST: webhook } = await import("@/app/api/webhooks/mercadopago/route")

/**
 * Chunked body without Content-Length, counting how many chunks the
 * reader pulled.
 *
 * @param chunkBytes - Size of each chunk.
 * @param chunks - How many chunks the stream can give.
 * @returns The stream and a getter of the pulled count.
 */
function chunkedStream(chunkBytes: number, chunks: number) {
  let pulled = 0
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (pulled >= chunks) {
        controller.close()
        return
      }
      pulled += 1
      controller.enqueue(new Uint8Array(chunkBytes).fill(0x61))
    },
  })
  return { stream, pulled: () => pulled }
}

/**
 * POST request with a streamed body (no Content-Length header).
 *
 * @param url - Target URL.
 * @param body - Body stream.
 * @returns The request.
 */
function streamedPost(url: string, body: ReadableStream<Uint8Array>) {
  return new Request(url, {
    method: "POST",
    body,
    duplex: "half",
  } as RequestInit & { duplex: "half" })
}

describe("readLimitedText (SEC-006, #220)", () => {
  it("returns the UTF-8 text when the body fits the ceiling", async () => {
    const request = new Request("https://loja.test/x", {
      method: "POST",
      body: "ação",
    })
    expect(await readLimitedText(request, 16)).toEqual({
      ok: true,
      text: "ação",
    })
  })

  it("counts bytes, not characters", async () => {
    // "ção" is 3 characters but 5 bytes in UTF-8
    const request = new Request("https://loja.test/x", {
      method: "POST",
      body: "ção",
    })
    expect(await readLimitedText(request, 4)).toEqual({
      ok: false,
      reason: "too_large",
    })
  })

  it("returns an empty text for a request without body", async () => {
    expect(
      await readLimitedText(new Request("https://loja.test/x"), 10)
    ).toEqual({ ok: true, text: "" })
  })

  it("refuses a declared Content-Length over the ceiling without reading", async () => {
    const { stream, pulled } = chunkedStream(1024, 10)
    const request = new Request("https://loja.test/x", {
      method: "POST",
      body: stream,
      headers: { "content-length": "10240" },
      duplex: "half",
    } as RequestInit & { duplex: "half" })
    expect(await readLimitedText(request, 1024)).toEqual({
      ok: false,
      reason: "too_large",
    })
    expect(pulled()).toBeLessThanOrEqual(1)
  })

  it("stops a 1 MB chunked body without Content-Length at the ceiling", async () => {
    const { stream, pulled } = chunkedStream(1024, 1024)
    const result = await readLimitedText(
      streamedPost("https://loja.test/x", stream),
      16_384
    )
    expect(result).toEqual({ ok: false, reason: "too_large" })
    // 16 KB fit; the 17th chunk passes the ceiling and the rest is
    // never pulled (a little read-ahead is allowed by the stream)
    expect(pulled()).toBeLessThan(20)
  })
})

describe("routes read the body with a byte ceiling (SEC-006)", () => {
  beforeEach(() => {
    vi.spyOn(console, "warn").mockImplementation(() => {})
    vi.spyOn(console, "error").mockImplementation(() => {})
    processPaymentNotification.mockReset()
  })

  it("csp-report answers 204 to a huge chunked body without reading it all", async () => {
    const { stream, pulled } = chunkedStream(1024, 1024)
    const response = await cspReport(
      streamedPost("https://loja.test/api/csp-report", stream)
    )
    expect(response.status).toBe(204)
    expect(pulled()).toBeLessThan(20)
    expect(console.warn).not.toHaveBeenCalled()
  })

  it("the Mercado Pago webhook answers 413 to a chunked body over 16 KB", async () => {
    const { stream, pulled } = chunkedStream(1024, 1024)
    const response = await webhook(
      streamedPost("https://loja.test/api/webhooks/mercadopago", stream)
    )
    expect(response.status).toBe(413)
    expect(pulled()).toBeLessThan(20)
    expect(processPaymentNotification).not.toHaveBeenCalled()
  })

  it("the Mercado Pago webhook still processes a small notification", async () => {
    processPaymentNotification.mockResolvedValue({ status: "processed" })
    const response = await webhook(
      new Request("https://loja.test/api/webhooks/mercadopago", {
        method: "POST",
        headers: { "x-request-id": "req-1", "x-signature": "ts=1,v1=x" },
        body: JSON.stringify({ type: "payment", data: { id: "123" } }),
      })
    )
    expect(response.status).toBe(200)
    expect(processPaymentNotification).toHaveBeenCalledWith({
      requestId: "req-1",
      topic: "payment",
      resourceId: "123",
    })
  })
})
