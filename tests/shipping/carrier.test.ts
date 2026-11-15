import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
  carrierConfig,
  parseCarrierPrice,
  quoteCarrier,
  toAggregatorProducts,
  toCarrierOption,
} from "@/features/shared/lib/carrier/carrier"
import { deliveryTimeMessage } from "@/features/shared/lib/shipping/shipping-messages"
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
 * Builds a shipping context outside the own delivery area.
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

/** Fictitious answer of the aggregator sandbox. */
const services = [
  {
    id: 1,
    name: "PAC",
    error: "Dimensões do objeto ultrapassam o limite da transportadora.",
    company: { name: "Correios" },
  },
  {
    id: 3,
    name: ".Package",
    price: "310.50",
    custom_price: "298.40",
    delivery_time: 7,
    custom_delivery_time: 8,
    company: { name: "Jadlog" },
  },
  {
    id: 17,
    name: "Rodoviário",
    price: "255.00",
    delivery_time: 10,
    company: { name: "Transportadora Fictícia" },
  },
]

/**
 * Fake aggregator API.
 *
 * @param body - Response body.
 * @param status - HTTP status.
 * @returns The fake fetch.
 */
function aggregator(body: unknown = services, status = 200) {
  return vi.fn(
    async () =>
      new Response(JSON.stringify(body), {
        status,
        headers: { "Content-Type": "application/json" },
      })
  ) as unknown as typeof fetch & ReturnType<typeof vi.fn>
}

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {})
  vi.spyOn(console, "info").mockImplementation(() => {})
  vi.stubEnv("CARRIER_API_TOKEN", "token-sandbox-ficticio")
  vi.stubEnv("CARRIER_API_BASE_URL", "https://carrier.test")
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe("carrier aggregator settings (#42)", () => {
  it("is not configured without the token", () => {
    vi.stubEnv("CARRIER_API_TOKEN", "")
    expect(carrierConfig()).toBeNull()
  })

  it("defaults to the sandbox", () => {
    vi.stubEnv("CARRIER_API_BASE_URL", "")
    expect(carrierConfig()).toMatchObject({
      baseUrl: "https://sandbox.melhorenvio.com.br",
      timeoutMs: 8000,
    })
  })
})

describe("carrier quote for large volumes (#42, RF49, RN20)", () => {
  it("shows the carrier, the delivery time and the price", async () => {
    const fetcher = aggregator()
    const options = await quoteCarrier(context([bulky, bulky]), fetcher)
    expect(options).toEqual([
      {
        method: "CARRIER",
        carrier: "Jadlog",
        service: ".Package",
        price: "298.40",
        deliveryDays: 8,
      },
      {
        method: "CARRIER",
        carrier: "Transportadora Fictícia",
        service: "Rodoviário",
        price: "255.00",
        deliveryDays: 10,
      },
    ])
    expect(deliveryTimeMessage(options[0]!)).toContain("8")

    const [url, init] = fetcher.mock.calls[0] as [string, RequestInit]
    expect(url).toBe("https://carrier.test/api/v2/me/shipment/calculate")
    const headers = init.headers as Record<string, string>
    expect(headers.Authorization).toBe("Bearer token-sandbox-ficticio")
    expect(headers["User-Agent"]).toBeTruthy()
    expect(JSON.parse(String(init.body))).toMatchObject({
      from: { postal_code: "04538133" },
      to: { postal_code: "70040010" },
      products: [
        { width: 60, height: 10, length: 120, weight: 20, quantity: 2 },
      ],
    })
  })

  it("does not call the aggregator when every volume fits the Correios", async () => {
    const fetcher = aggregator()
    expect(await quoteCarrier(context([small]), fetcher)).toEqual([])
    expect(fetcher).not.toHaveBeenCalled()
  })

  it("returns no option without the token or the origin CEP", async () => {
    const fetcher = aggregator()
    expect(
      await quoteCarrier({ ...context([bulky]), originCep: undefined }, fetcher)
    ).toEqual([])
    vi.stubEnv("CARRIER_API_TOKEN", "")
    expect(await quoteCarrier(context([bulky]), fetcher)).toEqual([])
    expect(fetcher).not.toHaveBeenCalled()
  })

  it("returns no option on an API error, a timeout or a bad payload", async () => {
    expect(
      await quoteCarrier(context([bulky]), aggregator({ message: "x" }, 500))
    ).toEqual([])
    expect(
      await quoteCarrier(context([bulky]), aggregator({ message: "x" }))
    ).toEqual([])
    const timeout = vi.fn(async () => {
      throw new DOMException("timeout", "TimeoutError")
    }) as unknown as typeof fetch
    expect(await quoteCarrier(context([bulky]), timeout)).toEqual([])
  })

  it("never logs the CEPs or the token", async () => {
    const spies = ["info", "error"].map((method) =>
      vi.spyOn(console, method as "info")
    )
    await quoteCarrier(context([bulky]), aggregator({}, 401))
    const logged = spies
      .flatMap((spy) => spy.mock.calls.flat())
      .map(String)
      .join("\n")
    expect(logged).toContain("401")
    expect(logged).not.toContain("70040010")
    expect(logged).not.toContain("token-sandbox-ficticio")
  })
})

describe("carrier API error falls back (#42, RN20)", () => {
  it("sends the order to the manual quote when the aggregator fails", async () => {
    const quote = await calculateShipping(
      context([small, bulky]),
      createShippingStrategies({
        correios: notConfiguredProvider("correios"),
        carrier: (ctx) => quoteCarrier(ctx, aggregator({}, 503)),
      })
    )
    expect(quote).toMatchObject({ status: "manual_quote", reason: "no_option" })
  })

  it("uses the carrier options sorted by price when the API answers", async () => {
    const quote = await calculateShipping(
      context([small, bulky]),
      createShippingStrategies({
        correios: notConfiguredProvider("correios"),
        carrier: (ctx) => quoteCarrier(ctx, aggregator()),
      })
    )
    expect(quote).toMatchObject({
      status: "quoted",
      strategy: "carrier",
      options: [{ price: "255.00" }, { price: "298.40" }],
    })
  })
})

describe("carrier helpers (#42)", () => {
  it("drops services with an error or unreadable data", () => {
    expect(toCarrierOption(services[0]!)).toBeNull()
    expect(toCarrierOption({ ...services[2]!, price: "0" })).toBeNull()
    expect(toCarrierOption({ ...services[2]!, delivery_time: 0 })).toBeNull()
    expect(toCarrierOption({ ...services[2]!, company: {} })).toBeNull()
  })

  it("reads prices as text or number", () => {
    expect(parseCarrierPrice("310.50")).toBe(31050)
    expect(parseCarrierPrice(12.3)).toBe(1230)
    expect(parseCarrierPrice("abc")).toBeNull()
    expect(parseCarrierPrice(null)).toBeNull()
  })

  it("groups identical volumes with a quantity", () => {
    expect(toAggregatorProducts([bulky, small, bulky])).toMatchObject([
      { id: "volume-1", quantity: 2, weight: 20 },
      { id: "volume-2", quantity: 1, weight: 2.8 },
    ])
  })
})
