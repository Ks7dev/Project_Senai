import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
  correiosConfig,
  groupVolumes,
  parseCorreiosPrice,
  quoteCorreios,
  resetCorreiosToken,
} from "@/features/shared/lib/correios/correios"
import {
  calculateShipping,
  createShippingStrategies,
  notConfiguredProvider,
  type ShippingContext,
} from "@/features/shared/lib/shipping/strategies"
import type { ShippingVolume } from "@/features/shared/lib/shipping/volumes"

const rules = {
  correiosMaxWeightKg: 30,
  correiosMaxSideCm: 100,
  correiosMaxDimensionsSumCm: 200,
  cubageFactor: 6000,
}

const small: ShippingVolume = {
  weightKg: 2.8,
  lengthCm: 40,
  widthCm: 25,
  heightCm: 12,
  requiresAssembly: false,
}
const bulky: ShippingVolume = {
  weightKg: 20,
  lengthCm: 120,
  widthCm: 60,
  heightCm: 10,
  requiresAssembly: false,
}

/**
 * Builds a shipping context to a CEP outside the own delivery area.
 *
 * @param volumes - Order packages.
 * @returns The context, shipping from a fictitious origin.
 */
function context(volumes: ShippingVolume[]): ShippingContext {
  return {
    cep: "70040010",
    volumes,
    rules,
    region: null,
    originCep: "04538133",
  }
}

/**
 * Fake Correios API: token, price per product code and deadline.
 *
 * @param overrides - Status or body per step.
 * @returns The fake fetch and the URLs it received.
 */
function correiosApi(
  overrides: {
    token?: number
    price?: Record<string, { status?: number; body?: unknown }>
    deadline?: { status?: number; body?: unknown }
  } = {}
) {
  const calls: string[] = []
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    })
  const fetcher = vi.fn(async (input: string | URL | Request) => {
    const url = String(input)
    calls.push(url)
    if (url.includes("/token/")) {
      return overrides.token
        ? json({ msgs: ["erro"] }, overrides.token)
        : json({ token: "fake-token", expiraEm: "2099-01-01T00:00:00" })
    }
    if (url.includes("/preco/")) {
      const code = url.split("/nacional/")[1].split("?")[0]
      const override = overrides.price?.[code]
      return json(
        override?.body ?? { pcFinal: code === "03298" ? "45,90" : "88,10" },
        override?.status ?? 200
      )
    }
    if (url.includes("/prazo/")) {
      const code = url.split("/nacional/")[1].split("?")[0]
      return json(
        overrides.deadline?.body ?? { prazoEntrega: code === "03298" ? 8 : 3 },
        overrides.deadline?.status ?? 200
      )
    }
    return json({}, 404)
  })
  return { fetcher: fetcher as unknown as typeof fetch, calls }
}

beforeEach(() => {
  resetCorreiosToken()
  vi.spyOn(console, "error").mockImplementation(() => {})
  vi.spyOn(console, "warn").mockImplementation(() => {})
  vi.spyOn(console, "info").mockImplementation(() => {})
  vi.spyOn(console, "log").mockImplementation(() => {})
  vi.stubEnv("CORREIOS_USER", "usuario-teste")
  vi.stubEnv("CORREIOS_ACCESS_CODE", "codigo-teste")
  vi.stubEnv("CORREIOS_POSTAGE_CARD", "0000000000")
  vi.stubEnv("CORREIOS_BASE_URL", "https://correios.test")
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe("Correios settings (#41)", () => {
  it("is not configured without the credentials", () => {
    vi.stubEnv("CORREIOS_ACCESS_CODE", "")
    expect(correiosConfig()).toBeNull()
  })

  it("defaults to the homologation API and the usual product codes", () => {
    vi.stubEnv("CORREIOS_BASE_URL", "")
    expect(correiosConfig()).toMatchObject({
      baseUrl: "https://apihom.correios.com.br",
      pacCode: "03298",
      sedexCode: "03220",
      timeoutMs: 5000,
    })
  })
})

describe("Correios PAC and SEDEX quote (#41, RF25, RN20)", () => {
  it("quotes PAC and SEDEX with price and delivery time", async () => {
    const { fetcher, calls } = correiosApi()
    const options = await quoteCorreios(context([small]), fetcher)
    expect(options).toEqual([
      {
        method: "CORREIOS_PAC",
        carrier: "Correios",
        service: "PAC",
        price: "45.90",
        deliveryDays: 8,
      },
      {
        method: "CORREIOS_SEDEX",
        carrier: "Correios",
        service: "SEDEX",
        price: "88.10",
        deliveryDays: 3,
      },
    ])
    const price = calls.find((url) => url.includes("/preco/v1/nacional/03298"))
    expect(price).toContain("cepOrigem=04538133")
    expect(price).toContain("cepDestino=70040010")
    expect(price).toContain("psObjeto=2800")
    expect(price).toContain("comprimento=40")
  })

  it("prices each package size once and multiplies by the units", async () => {
    const { fetcher, calls } = correiosApi()
    const options = await quoteCorreios(context([small, small]), fetcher)
    expect(options[0]?.price).toBe("91.80")
    expect(calls.filter((url) => url.includes("/preco/")).length).toBe(2)
  })

  it("reuses the token until it expires", async () => {
    const { fetcher, calls } = correiosApi()
    await quoteCorreios(context([small]), fetcher)
    await quoteCorreios(context([small]), fetcher)
    expect(calls.filter((url) => url.includes("/token/")).length).toBe(1)
  })

  it("never quotes a volume above the Correios limits", async () => {
    const { fetcher } = correiosApi()
    expect(await quoteCorreios(context([small, bulky]), fetcher)).toEqual([])
    expect(fetcher).not.toHaveBeenCalled()
  })

  it("returns no option without credentials or origin CEP", async () => {
    const { fetcher } = correiosApi()
    expect(
      await quoteCorreios(
        { ...context([small]), originCep: undefined },
        fetcher
      )
    ).toEqual([])
    vi.stubEnv("CORREIOS_USER", "")
    expect(await quoteCorreios(context([small]), fetcher)).toEqual([])
    expect(fetcher).not.toHaveBeenCalled()
  })

  it("drops a service that fails and keeps the other", async () => {
    const { fetcher } = correiosApi({ price: { "03220": { status: 500 } } })
    const options = await quoteCorreios(context([small]), fetcher)
    expect(options.map((option) => option.service)).toEqual(["PAC"])
  })

  it("drops a service with an unreadable price or deadline", async () => {
    const { fetcher } = correiosApi({
      price: { "03298": { body: { pcFinal: "abc" } } },
      deadline: { body: { prazoEntrega: 0 } },
    })
    expect(await quoteCorreios(context([small]), fetcher)).toEqual([])
  })

  it("returns no option when the authentication fails", async () => {
    const { fetcher } = correiosApi({ token: 401 })
    expect(await quoteCorreios(context([small]), fetcher)).toEqual([])
  })

  it("returns no option on a timeout or network error", async () => {
    const fetcher = vi.fn(async () => {
      throw new DOMException("timeout", "TimeoutError")
    }) as unknown as typeof fetch
    expect(await quoteCorreios(context([small]), fetcher)).toEqual([])
  })

  it("never logs the CEPs, the token or the payload", async () => {
    const spies = ["log", "info", "warn", "error"].map((method) =>
      vi.spyOn(console, method as "log")
    )
    const { fetcher } = correiosApi({ price: { "03220": { status: 500 } } })
    await quoteCorreios(context([small]), fetcher)
    const logged = spies
      .flatMap((spy) => spy.mock.calls.flat())
      .map(String)
      .join("\n")
    expect(logged).not.toContain("70040010")
    expect(logged).not.toContain("04538133")
    expect(logged).not.toContain("fake-token")
  })
})

describe("Correios API error falls back (#41, RN20)", () => {
  it("sends the order to the manual quote when the Correios fail", async () => {
    const { fetcher } = correiosApi({
      price: { "03298": { status: 503 }, "03220": { status: 503 } },
    })
    const quote = await calculateShipping(
      context([small]),
      createShippingStrategies({
        correios: (ctx) => quoteCorreios(ctx, fetcher),
        carrier: notConfiguredProvider("carrier"),
      })
    )
    expect(quote).toMatchObject({ status: "manual_quote", reason: "no_option" })
  })

  it("uses the Correios options when the API answers", async () => {
    const { fetcher } = correiosApi()
    const quote = await calculateShipping(
      context([small]),
      createShippingStrategies({
        correios: (ctx) => quoteCorreios(ctx, fetcher),
        carrier: notConfiguredProvider("carrier"),
      })
    )
    expect(quote).toMatchObject({
      status: "quoted",
      strategy: "correios",
      options: [{ service: "PAC" }, { service: "SEDEX" }],
    })
  })
})

describe("Correios helpers (#41)", () => {
  it("reads prices in the Brazilian format", () => {
    expect(parseCorreiosPrice("45,90")).toBe(4590)
    expect(parseCorreiosPrice("1.234,56")).toBe(123456)
    expect(parseCorreiosPrice("12.5")).toBe(1250)
    expect(parseCorreiosPrice(30)).toBe(3000)
    expect(parseCorreiosPrice("0,00")).toBeNull()
    expect(parseCorreiosPrice(undefined)).toBeNull()
  })

  it("groups identical volumes", () => {
    expect(groupVolumes([small, small, bulky])).toEqual([
      { volume: small, count: 2 },
      { volume: bulky, count: 1 },
    ])
  })
})
