import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
  ensureMercadoPagoSandboxChecked,
  mercadoPagoConfig,
  mercadoPagoProductionAllowed,
  mercadoPagoPublicKey,
  resetMercadoPagoSandboxCheck,
} from "@/features/shared/lib/mercadopago/mercadopago"

const PRODUCTION_TOKEN = "APP_USR-1234567890-secret-production-token"

let errors: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  errors = vi.spyOn(console, "error").mockImplementation(() => {})
  vi.stubEnv("MERCADOPAGO_ALLOW_PRODUCTION", "")
})

afterEach(() => {
  resetMercadoPagoSandboxCheck()
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

/**
 * Fake `GET /users/me` answering with the given tags.
 *
 * @param tags - Tags of the account.
 * @returns The fetch mock.
 */
function usersMe(tags: string[]) {
  return vi.fn(async () =>
    Response.json({ id: 1, site_id: "MLB", tags })
  ) as unknown as typeof fetch & ReturnType<typeof vi.fn>
}

describe("Mercado Pago test user credentials (#229)", () => {
  const TEST_USER_TOKEN = "APP_USR-111-test-user-token"

  it("accepts APP_USR- credentials of a test user after the check", async () => {
    vi.stubEnv("MERCADOPAGO_ACCESS_TOKEN", TEST_USER_TOKEN)
    vi.stubEnv("MERCADOPAGO_PUBLIC_KEY", "APP_USR-test-public-key")
    const fetcher = usersMe(["normal", "test_user"])
    await ensureMercadoPagoSandboxChecked(fetcher)
    expect(mercadoPagoConfig()?.accessToken).toBe(TEST_USER_TOKEN)
    expect(mercadoPagoPublicKey()).toBe("APP_USR-test-public-key")
    const [url, init] = fetcher.mock.calls[0] as [string, RequestInit]
    expect(url).toBe("https://api.mercadopago.com/users/me")
    expect(new Headers(init.headers).get("Authorization")).toBe(
      `Bearer ${TEST_USER_TOKEN}`
    )
    await ensureMercadoPagoSandboxChecked(fetcher)
    expect(fetcher).toHaveBeenCalledOnce()
  })

  it("keeps refusing APP_USR- credentials of a real account", async () => {
    vi.stubEnv("MERCADOPAGO_ACCESS_TOKEN", PRODUCTION_TOKEN)
    vi.stubEnv("MERCADOPAGO_PUBLIC_KEY", "APP_USR-public-key")
    await ensureMercadoPagoSandboxChecked(usersMe(["normal"]))
    expect(mercadoPagoConfig()).toBeNull()
    expect(mercadoPagoPublicKey()).toBeNull()
    const lines = errors.mock.calls
      .map((call: unknown[]) => String(call[0]))
      .join("\n")
    expect(lines).toContain("mercadopago account is not a test user")
    expect(lines).not.toContain(PRODUCTION_TOKEN)
  })

  it("keeps refusing when the check fails and waits before retrying", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {})
    vi.stubEnv("MERCADOPAGO_ACCESS_TOKEN", TEST_USER_TOKEN)
    const failing = vi.fn(async () => {
      throw new TypeError("network down")
    }) as unknown as typeof fetch & ReturnType<typeof vi.fn>
    await ensureMercadoPagoSandboxChecked(failing)
    expect(mercadoPagoConfig()).toBeNull()
    const working = usersMe(["test_user"])
    await ensureMercadoPagoSandboxChecked(working)
    expect(working).not.toHaveBeenCalled()
    expect(mercadoPagoConfig()).toBeNull()
  })

  it("skips the check for TEST- tokens and with the production opt-in", async () => {
    const fetcher = usersMe(["test_user"])
    vi.stubEnv("MERCADOPAGO_ACCESS_TOKEN", "TEST-1234")
    await ensureMercadoPagoSandboxChecked(fetcher)
    vi.stubEnv("MERCADOPAGO_ACCESS_TOKEN", PRODUCTION_TOKEN)
    vi.stubEnv("MERCADOPAGO_ALLOW_PRODUCTION", "true")
    await ensureMercadoPagoSandboxChecked(fetcher)
    expect(fetcher).not.toHaveBeenCalled()
  })
})
