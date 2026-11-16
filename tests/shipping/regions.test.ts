import { describe, expect, it } from "vitest"
import {
  coverageMessage,
  deliveryTimeMessage,
  manualQuoteReasonMessage,
} from "@/features/shared/lib/shipping/shipping-messages"
import { regionFormSchema } from "@/features/shipping/regions/schema/region-schema"

const valid = {
  name: "Região Metropolitana de São Paulo",
  cepStart: "01000-000",
  cepEnd: "09999-999",
  ownDelivery: true,
  rates: [{ maxKg: "30", price: "120,00" }],
  freeShippingMinimum: "",
  active: true,
}

describe("delivery region form (#43, RF50, RN16)", () => {
  it("normalizes CEPs, weights and prices", () => {
    const parsed = regionFormSchema.parse({
      ...valid,
      rates: [{ maxKg: "12,5", price: "99,9" }],
      freeShippingMinimum: "2500,00",
    })
    expect(parsed).toMatchObject({
      cepStart: "01000000",
      cepEnd: "09999999",
      rates: [{ maxKg: 12.5, price: "99.9" }],
      freeShippingMinimum: "2500.00",
    })
  })

  it("refuses a range that ends before it starts", () => {
    const parsed = regionFormSchema.safeParse({
      ...valid,
      cepStart: "09999999",
      cepEnd: "01000000",
    })
    expect(parsed.success).toBe(false)
    expect(parsed.error?.issues[0]?.message).toBe(
      "O CEP final deve ser maior ou igual ao inicial."
    )
  })

  it("requires a weight table for own delivery", () => {
    const parsed = regionFormSchema.safeParse({ ...valid, rates: [] })
    expect(parsed.error?.issues[0]?.message).toBe(
      "Informe ao menos uma faixa de peso para a entrega própria."
    )
    expect(
      regionFormSchema.safeParse({ ...valid, ownDelivery: false, rates: [] })
        .success
    ).toBe(true)
  })

  it("refuses repeated weights, zero weight and invalid prices", () => {
    expect(
      regionFormSchema.safeParse({
        ...valid,
        rates: [
          { maxKg: "30", price: "1" },
          { maxKg: "30,0", price: "2" },
        ],
      }).error?.issues[0]?.message
    ).toBe("Há faixas de peso repetidas.")
    expect(
      regionFormSchema.safeParse({
        ...valid,
        rates: [{ maxKg: "0", price: "1" }],
      }).success
    ).toBe(false)
    expect(
      regionFormSchema.safeParse({
        ...valid,
        rates: [{ maxKg: "10", price: "-5" }],
      }).success
    ).toBe(false)
  })
})

describe("coverage notice (RF27)", () => {
  it("names the own delivery region", () => {
    expect(coverageMessage({ ownDelivery: true, regionName: "RMSP" })).toBe(
      "CEP dentro da área de entrega e montagem própria (RMSP)."
    )
  })

  it("explains that other CEPs depend on the Correios or a carrier", () => {
    expect(coverageMessage({ ownDelivery: false, regionName: null })).toMatch(
      /Correios ou por transportadora/
    )
  })

  it("explains the manual quote and the delivery time", () => {
    expect(manualQuoteReasonMessage("assembly_outside_coverage")).toMatch(
      /montagem/
    )
    expect(
      deliveryTimeMessage({
        method: "OWN_DELIVERY",
        carrier: "Atelier Bureau",
        service: "Entrega própria com montagem",
        price: "120.00",
        deliveryDays: null,
      })
    ).toBe("Data agendada no checkout")
  })
})
