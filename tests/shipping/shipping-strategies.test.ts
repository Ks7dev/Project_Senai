import { beforeEach, describe, expect, it, vi } from "vitest"
import {
  calculateShipping,
  carrierStrategy,
  correiosStrategy,
  ownDeliveryPrice,
  ownDeliveryStrategy,
  shippingStrategies,
  type CoverageRegion,
  type ShippingContext,
  type ShippingOption,
  type ShippingStrategy,
} from "@/features/shared/lib/shipping/strategies"
import {
  billableWeightKg,
  cubedWeightKg,
  fitsCorreios,
  toVolumes,
  totalBillableWeightKg,
  type ShippingRules,
  type ShippingVolume,
} from "@/features/shared/lib/shipping/volumes"
import { settings } from "@/prisma/seed-data"

const setting = (key: string) =>
  Number(settings.find((item) => item.key === key)?.value)

/** Rules as seeded (RN20 values confirmed in issue #5). */
const rules: ShippingRules = {
  correiosMaxWeightKg: setting("shipping.correios_max_weight_kg"),
  correiosMaxSideCm: setting("shipping.correios_max_side_cm"),
  correiosMaxDimensionsSumCm: setting(
    "shipping.correios_max_dimensions_sum_cm"
  ),
  cubageFactor: setting("shipping.cubage_factor"),
}

const rmsp: CoverageRegion = {
  id: "rmsp",
  name: "Região Metropolitana de São Paulo",
  ownDelivery: true,
  ownDeliveryRates: [
    { maxKg: 100, price: "240.00" },
    { maxKg: 30, price: "120.00" },
  ],
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
const desk: ShippingVolume = {
  weightKg: 62,
  lengthCm: 160,
  widthCm: 80,
  heightCm: 12,
  requiresAssembly: true,
}

const option = (
  method: ShippingOption["method"],
  price: string
): ShippingOption => ({
  method,
  carrier: "Teste",
  service: method,
  price,
  deliveryDays: 5,
})

/**
 * Builds a context.
 *
 * @param volumes - Order volumes.
 * @param region - Region of the CEP.
 * @returns The context.
 */
function context(
  volumes: ShippingVolume[],
  region: CoverageRegion | null = null
): ShippingContext {
  return { cep: "01310100", volumes, rules, region }
}

/**
 * Strategies with fake providers for the Correios and the carrier.
 *
 * @param correios - Correios answer.
 * @param carrier - Carrier answer.
 * @returns The strategies in RN20 order.
 */
function strategies(
  correios: () => Promise<ShippingOption[]>,
  carrier: () => Promise<ShippingOption[]>
): ShippingStrategy[] {
  return [
    ownDeliveryStrategy,
    correiosStrategy(vi.fn(correios)),
    carrierStrategy(vi.fn(carrier)),
  ]
}

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {})
  vi.spyOn(console, "info").mockImplementation(() => {})
})

describe("billable weight by volume (#40)", () => {
  it("uses the cubage factor from the settings", () => {
    expect(rules.cubageFactor).toBe(6000)
    expect(cubedWeightKg(desk, 6000)).toBeCloseTo(25.6)
  })

  it("charges the larger of the real and the cubed weight", () => {
    expect(billableWeightKg(desk, 6000)).toBe(62)
    // 120 × 60 × 10 / 6000 = 12 kg cubed, below the 20 kg real
    expect(billableWeightKg(bulky, 6000)).toBe(20)
    // A light but large box is charged by volume
    const box = { ...small, weightKg: 1, lengthCm: 60, widthCm: 50 }
    expect(billableWeightKg(box, 6000)).toBe(6)
  })

  it("sums the billable weight of every volume", () => {
    const volumes = toVolumes([{ ...small, quantity: 3 }])
    expect(volumes).toHaveLength(3)
    expect(totalBillableWeightKg(volumes, 6000)).toBe(8.4)
  })

  it("changes with the configured factor", () => {
    const box = { ...small, weightKg: 1, lengthCm: 60, widthCm: 50 }
    expect(billableWeightKg(box, 4000)).toBe(9)
  })
})

describe("Correios limits of RN20", () => {
  it("accepts up to 30 kg, 100 cm on the longest side and 200 cm in sum", () => {
    expect(fitsCorreios(small, rules)).toBe(true)
    expect(
      fitsCorreios(
        { ...small, weightKg: 30, lengthCm: 100, widthCm: 50, heightCm: 50 },
        rules
      )
    ).toBe(true)
  })

  it("rejects each limit exceeded", () => {
    expect(fitsCorreios({ ...small, weightKg: 30.001 }, rules)).toBe(false)
    expect(fitsCorreios({ ...small, lengthCm: 101 }, rules)).toBe(false)
    expect(
      fitsCorreios({ ...small, lengthCm: 90, widthCm: 60, heightCm: 51 }, rules)
    ).toBe(false)
  })
})

describe("modality chosen by RN20 (#40, RF25)", () => {
  it("sends small volumes without assembly to the Correios", async () => {
    const result = await calculateShipping(
      context([small]),
      strategies(
        async () => [
          option("CORREIOS_SEDEX", "80.00"),
          option("CORREIOS_PAC", "45.30"),
        ],
        async () => [option("CARRIER", "999.00")]
      )
    )
    expect(result).toMatchObject({ status: "quoted", strategy: "correios" })
    if (result.status === "quoted") {
      expect(result.options.map((item) => item.method)).toEqual([
        "CORREIOS_PAC",
        "CORREIOS_SEDEX",
      ])
    }
  })

  it("sends volumes above the Correios limits to the carrier", async () => {
    const correios = vi.fn(async () => [option("CORREIOS_PAC", "1.00")])
    const result = await calculateShipping(context([small, bulky]), [
      correiosStrategy(correios),
      carrierStrategy(async () => [option("CARRIER", "310.00")]),
    ])
    expect(result).toMatchObject({ status: "quoted", strategy: "carrier" })
    expect(correios).not.toHaveBeenCalled()
  })

  it("uses own delivery with assembly inside the coverage area", async () => {
    const result = await calculateShipping(
      context([desk, small], rmsp),
      strategies(
        async () => [option("CORREIOS_PAC", "1.00")],
        async () => [option("CARRIER", "1.00")]
      )
    )
    expect(result).toEqual({
      status: "quoted",
      strategy: "own_delivery",
      options: [
        {
          method: "OWN_DELIVERY",
          carrier: "Atelier Bureau",
          service: "Entrega própria com montagem",
          price: "240.00",
          deliveryDays: null,
        },
      ],
      coverage: { ownDelivery: true, regionName: rmsp.name },
    })
  })

  it("asks for a manual quote when assembly is outside the coverage", async () => {
    const result = await calculateShipping(
      context([desk], { ...rmsp, ownDelivery: false, name: "Outra região" }),
      strategies(
        async () => [option("CORREIOS_PAC", "1.00")],
        async () => [option("CARRIER", "1.00")]
      )
    )
    expect(result).toEqual({
      status: "manual_quote",
      reason: "assembly_outside_coverage",
      coverage: { ownDelivery: false, regionName: "Outra região" },
    })
  })

  it("asks for a manual quote when the API fails or has no route", async () => {
    const failing = await calculateShipping(
      context([small]),
      strategies(
        async () => {
          throw new Error("timeout")
        },
        async () => [option("CARRIER", "1.00")]
      )
    )
    expect(failing).toMatchObject({
      status: "manual_quote",
      reason: "no_option",
    })

    const empty = await calculateShipping(
      context([bulky]),
      strategies(
        async () => [],
        async () => []
      )
    )
    expect(empty).toMatchObject({
      status: "manual_quote",
      reason: "no_option",
    })
  })

  it("asks for a manual quote above the heaviest own delivery rate", async () => {
    const heavy = { ...desk, weightKg: 150 }
    const result = await calculateShipping(
      context([heavy], rmsp),
      shippingStrategies
    )
    expect(result).toMatchObject({
      status: "manual_quote",
      reason: "no_option",
    })
  })

  it("falls back to the manual quote while the APIs are not configured", async () => {
    const result = await calculateShipping(context([small]))
    expect(result).toMatchObject({ status: "manual_quote" })
  })
})

describe("new modalities without changing the checkout (#40)", () => {
  it("accepts a new strategy in the registry", async () => {
    const pickup: ShippingStrategy = {
      id: "pickup",
      appliesTo: () => true,
      quote: async () => [
        {
          method: "OWN_DELIVERY",
          carrier: "Atelier Bureau",
          service: "Retirada no showroom",
          price: "0.00",
          deliveryDays: 1,
        },
      ],
    }
    const result = await calculateShipping(context([small]), [
      ...shippingStrategies,
      pickup,
    ])
    expect(result).toMatchObject({ status: "quoted", strategy: "pickup" })
  })
})

describe("own delivery price table (RF50)", () => {
  it("picks the first rate that covers the weight", () => {
    expect(ownDeliveryPrice(rmsp.ownDeliveryRates, 10)).toBe("120.00")
    expect(ownDeliveryPrice(rmsp.ownDeliveryRates, 30)).toBe("120.00")
    expect(ownDeliveryPrice(rmsp.ownDeliveryRates, 30.5)).toBe("240.00")
    expect(ownDeliveryPrice(rmsp.ownDeliveryRates, 101)).toBeNull()
    expect(ownDeliveryPrice([], 1)).toBeNull()
  })
})
