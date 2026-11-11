import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
  createMercadoPagoPayment,
  getMercadoPagoPayment,
  mapProviderStatus,
  MercadoPagoError,
  mercadoPagoConfig,
  mercadoPagoNotificationUrl,
  toProviderPayment,
  type CreatePaymentBody,
} from "@/features/shared/lib/mercadopago/mercadopago"
import { paymentStatusMessage } from "@/features/shared/lib/payments/payment-messages"
import {
  AMOUNT_MISMATCH_DETAIL,
  nextPaymentStatus,
} from "@/features/shared/lib/payments/payment-sync"

/** Fictitious approved card payment of the sandbox. */
const approved = {
  id: 1234567890,
  status: "approved",
  status_detail: "accredited",
  transaction_amount: 589.9,
  currency_id: "BRL",
  external_reference: "0193a6c2-0000-7000-8000-000000000001",
  payment_method_id: "visa",
  installments: 3,
  date_approved: "2026-11-11T12:00:00.000-03:00",
  payer: { email: "comprador@teste.test" },
  card: { last_four_digits: "1234" },
}

const body: CreatePaymentBody = {
  transaction_amount: 589.9,
  description: "Pedido AB-2026-000001 — Atelier Bureau",
  payment_method_id: "visa",
  token: "tok_teste_123456",
  installments: 1,
  external_reference: "0193a6c2-0000-7000-8000-000000000001",
  payer: { email: "comprador@teste.test" },
}

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {})
  vi.spyOn(console, "info").mockImplementation(() => {})
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe("Mercado Pago configuration (#54)", () => {
  it("is off without the access token", () => {
    vi.stubEnv("MERCADOPAGO_ACCESS_TOKEN", "")
    expect(mercadoPagoConfig()).toBeNull()
  })

  it("defaults to the official API and a timeout", () => {
    vi.stubEnv("MERCADOPAGO_ACCESS_TOKEN", "TEST-token")
    vi.stubEnv("MERCADOPAGO_BASE_URL", "")
    vi.stubEnv("MERCADOPAGO_TIMEOUT_MS", "")
    expect(mercadoPagoConfig()).toEqual({
      baseUrl: "https://api.mercadopago.com",
      accessToken: "TEST-token",
      timeoutMs: 10_000,
    })
  })

  it("only sends an HTTPS notification URL", () => {
    vi.stubEnv("MERCADOPAGO_NOTIFICATION_URL", "http://localhost/webhook")
    expect(mercadoPagoNotificationUrl()).toBeNull()
    vi.stubEnv(
      "MERCADOPAGO_NOTIFICATION_URL",
      "https://tunel.teste/api/webhooks/mercadopago"
    )
    expect(mercadoPagoNotificationUrl()).toBe(
      "https://tunel.teste/api/webhooks/mercadopago"
    )
  })
})

describe("Mercado Pago payment answer (#54)", () => {
  it("keeps only what the store uses", () => {
    const payment = toProviderPayment(approved)
    expect(payment).toMatchObject({
      id: "1234567890",
      status: "approved",
      statusDetail: "accredited",
      amount: "589.90",
      currency: "BRL",
      installments: 3,
      threeDs: null,
      pix: null,
      boleto: null,
    })
    expect(JSON.stringify(payment)).not.toContain("comprador@teste.test")
    expect(JSON.stringify(payment)).not.toContain('1234"')
  })

  it("reads the 3DS challenge (RF37)", () => {
    const payment = toProviderPayment({
      ...approved,
      status: "pending",
      status_detail: "pending_challenge",
      three_ds_info: {
        external_resource_url: "https://acs.teste/challenge",
        creq: "creq-teste",
      },
    })
    expect(payment.threeDs).toEqual({
      externalResourceUrl: "https://acs.teste/challenge",
      creq: "creq-teste",
    })
  })

  it("refuses an unreadable payload", () => {
    expect(() => toProviderPayment({ status: "approved" })).toThrow(
      MercadoPagoError
    )
  })

  it("confirms only approved payments (RN13)", () => {
    expect(mapProviderStatus("approved")).toBe("APPROVED")
    expect(mapProviderStatus("authorized")).toBe("PENDING")
    expect(mapProviderStatus("in_process")).toBe("PENDING")
    expect(mapProviderStatus("pending")).toBe("PENDING")
    expect(mapProviderStatus("rejected")).toBe("REJECTED")
    expect(mapProviderStatus("cancelled")).toBe("CANCELED")
    expect(mapProviderStatus("refunded", "589.90", "589.90")).toBe("REFUNDED")
    expect(mapProviderStatus("approved", "100.00", "589.90")).toBe(
      "PARTIALLY_REFUNDED"
    )
  })
})

describe("stored payment status (#54, RN13)", () => {
  const provider = {
    status: "approved",
    statusDetail: "accredited",
    amount: "589.90",
    currency: "BRL",
    refundedAmount: "0.00",
  }

  it("approves when the amount is the order's", () => {
    expect(nextPaymentStatus("PENDING", provider, "589.90")).toEqual({
      status: "APPROVED",
      statusDetail: "accredited",
    })
  })

  it("keeps a different amount pending for the finance team", () => {
    expect(nextPaymentStatus("PENDING", provider, "600.00")).toEqual({
      status: "PENDING",
      statusDetail: AMOUNT_MISMATCH_DETAIL,
    })
    expect(
      nextPaymentStatus("PENDING", { ...provider, currency: "USD" }, "589.90")
        .status
    ).toBe("PENDING")
  })

  it("never moves a settled payment back to pending", () => {
    expect(
      nextPaymentStatus(
        "APPROVED",
        { ...provider, status: "in_process" },
        "589.90"
      ).status
    ).toBe("APPROVED")
    expect(
      nextPaymentStatus(
        "REJECTED",
        { ...provider, status: "pending" },
        "589.90"
      ).status
    ).toBe("REJECTED")
  })

  it("explains rejections in Portuguese", () => {
    expect(
      paymentStatusMessage("REJECTED", "cc_rejected_insufficient_amount")
    ).toBe("O cartão não tem limite suficiente.")
    expect(paymentStatusMessage("REJECTED", "unknown_detail")).toContain(
      "não foi aprovado"
    )
  })
})

describe("Mercado Pago API calls (#54)", () => {
  beforeEach(() => {
    vi.stubEnv("MERCADOPAGO_ACCESS_TOKEN", "TEST-token-secreto")
    vi.stubEnv("MERCADOPAGO_BASE_URL", "https://mp.teste")
  })

  it("creates the payment with the idempotency key (RF36)", async () => {
    const fetcher = vi.fn(
      async () => new Response(JSON.stringify(approved), { status: 201 })
    )
    const payment = await createMercadoPagoPayment(
      body,
      "row-id",
      fetcher as unknown as typeof fetch
    )
    expect(payment.status).toBe("approved")
    const [url, init] = fetcher.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ]
    expect(url).toBe("https://mp.teste/v1/payments")
    expect(init.method).toBe("POST")
    const headers = init.headers as Record<string, string>
    expect(headers["X-Idempotency-Key"]).toBe("row-id")
    expect(headers.Authorization).toBe("Bearer TEST-token-secreto")
    expect(init.signal).toBeInstanceOf(AbortSignal)
  })

  it("tells a refusal from an unknown outcome", async () => {
    const refused = vi.fn(async () => new Response("{}", { status: 400 }))
    await expect(
      createMercadoPagoPayment(
        body,
        "row-id",
        refused as unknown as typeof fetch
      )
    ).rejects.toMatchObject({ kind: "refused", status: 400 })

    const down = vi.fn(async () => new Response("{}", { status: 502 }))
    await expect(
      createMercadoPagoPayment(body, "row-id", down as unknown as typeof fetch)
    ).rejects.toMatchObject({ kind: "unavailable" })

    const timeout = vi.fn(async () => {
      throw new DOMException("timeout", "TimeoutError")
    })
    await expect(
      createMercadoPagoPayment(
        body,
        "row-id",
        timeout as unknown as typeof fetch
      )
    ).rejects.toMatchObject({ kind: "unavailable" })
  })

  it("never logs the token, the payer or the payload", async () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => {})
    const refused = vi.fn(
      async () =>
        new Response(JSON.stringify({ message: "invalid token" }), {
          status: 400,
        })
    )
    await createMercadoPagoPayment(
      body,
      "row-id",
      refused as unknown as typeof fetch
    ).catch(() => undefined)
    const logged = errors.mock.calls.flat().join(" ")
    expect(logged).toContain("400")
    expect(logged).not.toContain("TEST-token-secreto")
    expect(logged).not.toContain("tok_teste")
    expect(logged).not.toContain("comprador@teste.test")
  })

  it("is not configured without the token", async () => {
    vi.stubEnv("MERCADOPAGO_ACCESS_TOKEN", "")
    const fetcher = vi.fn()
    await expect(
      getMercadoPagoPayment("123", fetcher as unknown as typeof fetch)
    ).rejects.toMatchObject({ kind: "not_configured" })
    expect(fetcher).not.toHaveBeenCalled()
  })

  it("only reads numeric payment ids", async () => {
    const fetcher = vi.fn()
    await expect(
      getMercadoPagoPayment("../users/me", fetcher as unknown as typeof fetch)
    ).rejects.toMatchObject({ kind: "not_found" })
    expect(fetcher).not.toHaveBeenCalled()
  })
})
