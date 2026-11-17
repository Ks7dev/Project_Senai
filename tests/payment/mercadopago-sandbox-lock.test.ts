import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
  mercadoPagoConfig,
  mercadoPagoProductionAllowed,
  mercadoPagoPublicKey,
} from "@/features/shared/lib/mercadopago/mercadopago"

const PRODUCTION_TOKEN = "APP_USR-1234567890-secret-production-token"

let errors: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  errors = vi.spyOn(console, "error").mockImplementation(() => {})
  vi.stubEnv("MERCADOPAGO_ALLOW_PRODUCTION", "")
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe("Mercado Pago sandbox lock (#7)", () => {
  it("accepts sandbox credentials", () => {
    vi.stubEnv("MERCADOPAGO_ACCESS_TOKEN", "TEST-1234")
    vi.stubEnv("MERCADOPAGO_PUBLIC_KEY", "TEST-public")
    expect(mercadoPagoConfig()?.accessToken).toBe("TEST-1234")
    expect(mercadoPagoPublicKey()).toBe("TEST-public")
    expect(errors).not.toHaveBeenCalled()
  })

  it("refuses a production token by default and logs without the value", () => {
    vi.stubEnv("MERCADOPAGO_ACCESS_TOKEN", PRODUCTION_TOKEN)
    expect(mercadoPagoProductionAllowed()).toBe(false)
    expect(mercadoPagoConfig()).toBeNull()
    expect(errors).toHaveBeenCalledOnce()
    const line = String(errors.mock.calls[0][0])
    expect(line).toContain("mercadopago production credential refused")
    expect(line).toContain("MERCADOPAGO_ALLOW_PRODUCTION")
    expect(line).not.toContain(PRODUCTION_TOKEN)
    expect(line).not.toContain("APP_USR")
  })

  it("refuses a production public key by default", () => {
    vi.stubEnv("MERCADOPAGO_PUBLIC_KEY", "APP_USR-public-key")
    expect(mercadoPagoPublicKey()).toBeNull()
  })

  it.each(["false", "1", "yes", ""])(
    "keeps refusing with MERCADOPAGO_ALLOW_PRODUCTION=%s",
    (value) => {
      vi.stubEnv("MERCADOPAGO_ALLOW_PRODUCTION", value)
      vi.stubEnv("MERCADOPAGO_ACCESS_TOKEN", PRODUCTION_TOKEN)
      expect(mercadoPagoConfig()).toBeNull()
    }
  )

  it("accepts production credentials only with the explicit opt-in", () => {
    vi.stubEnv("MERCADOPAGO_ALLOW_PRODUCTION", "true")
    vi.stubEnv("MERCADOPAGO_ACCESS_TOKEN", PRODUCTION_TOKEN)
    vi.stubEnv("MERCADOPAGO_PUBLIC_KEY", "APP_USR-public-key")
    expect(mercadoPagoConfig()?.accessToken).toBe(PRODUCTION_TOKEN)
    expect(mercadoPagoPublicKey()).toBe("APP_USR-public-key")
  })
})
