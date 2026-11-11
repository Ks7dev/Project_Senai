import { createHmac } from "node:crypto"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
  findMercadoPagoPaymentByReference,
  verifyWebhookSignature,
} from "@/features/shared/lib/mercadopago/mercadopago"

const secret = "segredo-de-teste"

/**
 * Signs a manifest like Mercado Pago does.
 *
 * @param manifest - Signed text.
 * @param key - Secret.
 * @returns The hex HMAC-SHA256.
 */
function sign(manifest: string, key = secret): string {
  return createHmac("sha256", key).update(manifest).digest("hex")
}

describe("webhook signature (#57, RF30)", () => {
  const ts = "1742505638683"
  const requestId = "bb56a2f1-6aae-46ac-982e-9dcd3581d08e"

  it("accepts the HMAC of id, request id and ts", () => {
    const v1 = sign(`id:123456;request-id:${requestId};ts:${ts};`)
    expect(
      verifyWebhookSignature({
        signature: `ts=${ts},v1=${v1}`,
        requestId,
        dataId: "123456",
        secret,
      })
    ).toBe(true)
  })

  it("lowercases alphanumeric ids, as Mercado Pago signs them", () => {
    const v1 = sign(`id:abc123;request-id:${requestId};ts:${ts};`)
    expect(
      verifyWebhookSignature({
        signature: `ts=${ts}, v1=${v1}`,
        requestId,
        dataId: "ABC123",
        secret,
      })
    ).toBe(true)
  })

  it("refuses another secret, a changed id or a missing header", () => {
    const v1 = sign(`id:123456;request-id:${requestId};ts:${ts};`, "outro")
    expect(
      verifyWebhookSignature({
        signature: `ts=${ts},v1=${v1}`,
        requestId,
        dataId: "123456",
        secret,
      })
    ).toBe(false)
    const valid = sign(`id:123456;request-id:${requestId};ts:${ts};`)
    expect(
      verifyWebhookSignature({
        signature: `ts=${ts},v1=${valid}`,
        requestId,
        dataId: "999999",
        secret,
      })
    ).toBe(false)
    expect(
      verifyWebhookSignature({
        signature: null,
        requestId,
        dataId: "123456",
        secret,
      })
    ).toBe(false)
    expect(
      verifyWebhookSignature({
        signature: `ts=${ts},v1=zz`,
        requestId,
        dataId: "123456",
        secret,
      })
    ).toBe(false)
  })
})

describe("payment search by external reference (#57)", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    vi.stubEnv("MERCADOPAGO_ACCESS_TOKEN", "TEST-token")
    vi.stubEnv("MERCADOPAGO_BASE_URL", "https://mp.teste")
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  it("reads the newest payment of the reference", async () => {
    const fetcher = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            results: [
              {
                id: 42,
                status: "approved",
                transaction_amount: 10,
                external_reference: "row-1",
              },
            ],
          }),
          { status: 200 }
        )
    )
    const payment = await findMercadoPagoPaymentByReference(
      "row-1",
      fetcher as unknown as typeof fetch
    )
    expect(payment?.id).toBe("42")
    const [url] = fetcher.mock.calls[0] as unknown as [string]
    expect(url).toContain("/v1/payments/search?external_reference=row-1")
  })

  it("returns null when nothing was created", async () => {
    const fetcher = vi.fn(
      async () => new Response(JSON.stringify({ results: [] }), { status: 200 })
    )
    expect(
      await findMercadoPagoPaymentByReference(
        "row-2",
        fetcher as unknown as typeof fetch
      )
    ).toBeNull()
  })
})
