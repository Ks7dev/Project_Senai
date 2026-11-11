import { describe, expect, it } from "vitest"
import {
  isServiceEligible,
  priceLineExtras,
  type CartExtrasRules,
} from "@/features/shared/lib/cart/cart-extras"
import {
  canCancelOrderItem,
  isPersonalized,
  PERSONALIZED_NOT_CANCELABLE_MESSAGE,
} from "@/features/shared/lib/orders/cancellation"
import {
  engravingRuleSchema,
  serviceRulesSchema,
} from "@/features/shared/schema/cart-schema"
import { settings } from "@/prisma/seed-data"

const rules: CartExtrasRules = {
  engraving: { price: "90.00", extraBusinessDays: 3, maxLength: 30 },
  services: [
    {
      key: "institutional_packaging",
      label: "Embalagem institucional",
      description: "",
      price: "35.00",
      courtesy: false,
      extraBusinessDays: 1,
      eligibility: "all",
    },
    {
      key: "assembly",
      label: "Montagem",
      description: "",
      price: "250.00",
      courtesy: false,
      extraBusinessDays: 0,
      eligibility: "installation",
    },
    {
      key: "gift_card",
      label: "Cartão",
      description: "",
      price: "15.00",
      courtesy: true,
      extraBusinessDays: 0,
      eligibility: "all",
    },
  ],
}

const notebook = { personalizable: true, requiresInstallation: false }
const desk = { personalizable: false, requiresInstallation: true }
const engraving = { type: "laser_engraving", text: "Diretoria", font: "serif" }

describe("engraving and services pricing (#47, RF51, RF52)", () => {
  it("adds the engraving cost per unit and its extra days", () => {
    const extras = priceLineExtras(
      { ...notebook, quantity: 3, personalization: engraving, services: null },
      rules
    )
    expect(extras.personalization).toEqual(engraving)
    expect(extras.engravingTotal).toBe("270.00")
    expect(extras.extrasTotal).toBe("270.00")
    expect(extras.extraBusinessDays).toBe(3)
  })

  it("sums the services per unit and the extra days within the line", () => {
    const extras = priceLineExtras(
      {
        ...notebook,
        quantity: 2,
        personalization: engraving,
        services: ["institutional_packaging", "gift_card"],
      },
      rules
    )
    expect(extras.services.map((s) => [s.key, s.total, s.courtesy])).toEqual([
      ["institutional_packaging", "70.00", false],
      ["gift_card", "0.00", true],
    ])
    expect(extras.extrasTotal).toBe("250.00")
    expect(extras.extraBusinessDays).toBe(4)
  })

  it("ignores engraving on products that do not accept it", () => {
    const extras = priceLineExtras(
      { ...desk, quantity: 1, personalization: engraving, services: [] },
      rules
    )
    expect(extras.personalization).toBeNull()
    expect(extras.extrasTotal).toBe("0.00")
  })

  it("only charges eligible services that are still offered", () => {
    expect(isServiceEligible(rules.services[1]!, notebook)).toBe(false)
    expect(isServiceEligible(rules.services[1]!, desk)).toBe(true)
    const extras = priceLineExtras(
      {
        ...notebook,
        quantity: 1,
        personalization: null,
        services: ["assembly", "removed_service", "institutional_packaging"],
      },
      rules
    )
    expect(extras.services.map((s) => s.key)).toEqual([
      "institutional_packaging",
    ])
  })

  it("drops malformed or too long engravings", () => {
    const long = { ...engraving, text: "x".repeat(31) }
    expect(
      priceLineExtras(
        { ...notebook, quantity: 1, personalization: long, services: null },
        rules
      ).personalization
    ).toBeNull()
    expect(
      priceLineExtras(
        { ...notebook, quantity: 1, personalization: "texto", services: 3 },
        rules
      ).extrasTotal
    ).toBe("0.00")
  })

  it("seeds valid, configurable rules (never fixed in code)", () => {
    const value = (key: string) => settings.find((s) => s.key === key)?.value
    expect(
      engravingRuleSchema.safeParse(value("personalization.engraving")).success
    ).toBe(true)
    const services = serviceRulesSchema.parse(value("cart.additional_services"))
    expect(services.map((s) => s.key)).toEqual([
      "institutional_packaging",
      "assembly",
    ])
  })
})

describe("personalized items cancellation (#47, RN24)", () => {
  const personalized = { personalized: true, personType: "PJ" as const }

  it("allows canceling before production starts", () => {
    for (const status of ["AWAITING_PAYMENT", "PAID"] as const) {
      expect(
        canCancelOrderItem({ ...personalized, status }, "customer_request")
      ).toEqual({ allowed: true })
    }
  })

  it("blocks canceling personalized items once production started", () => {
    for (const status of [
      "IN_PRODUCTION",
      "SEPARATING",
      "SHIPPED",
      "DELIVERED",
    ] as const) {
      expect(
        canCancelOrderItem({ ...personalized, status }, "customer_request")
      ).toEqual({
        allowed: false,
        message: PERSONALIZED_NOT_CANCELABLE_MESSAGE,
      })
    }
  })

  it("keeps the defect exception and the PF withdrawal right (RN22)", () => {
    const status = "IN_PRODUCTION" as const
    expect(
      canCancelOrderItem({ ...personalized, status }, "defect").allowed
    ).toBe(true)
    expect(
      canCancelOrderItem({ ...personalized, status }, "withdrawal").allowed
    ).toBe(false)
    expect(
      canCancelOrderItem(
        { personalized: true, personType: "PF", status },
        "withdrawal"
      ).allowed
    ).toBe(true)
  })

  it("does not restrict items without personalization", () => {
    expect(
      canCancelOrderItem(
        { personalized: false, personType: "PJ", status: "IN_PRODUCTION" },
        "customer_request"
      ).allowed
    ).toBe(true)
    expect(isPersonalized(null)).toBe(false)
    expect(isPersonalized({})).toBe(false)
    expect(isPersonalized(engraving)).toBe(true)
  })
})
