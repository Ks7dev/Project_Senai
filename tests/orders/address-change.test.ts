import { describe, expect, it } from "vitest"
import {
  addressChangeQuoteSchema,
  confirmAddressChangeSchema,
} from "@/features/orders/address-change/schema/address-change-schema"
import {
  ADDRESS_CHANGE_STATUSES,
  canChangeAddress,
} from "@/features/shared/lib/orders/order-status"

const orderId = "0193a6c2-0000-7000-8000-000000000001"
const addressId = "0193a6c2-0000-7000-8000-000000000002"

describe("address change window (#45, RN15)", () => {
  it("allows the change only before the payment", () => {
    expect(ADDRESS_CHANGE_STATUSES).toEqual([
      "AWAITING_SHIPPING_QUOTE",
      "AWAITING_APPROVAL",
      "AWAITING_PAYMENT",
    ])
    expect(canChangeAddress("AWAITING_PAYMENT")).toBe(true)
    expect(canChangeAddress("PAID")).toBe(false)
    expect(canChangeAddress("SHIPPED")).toBe(false)
    expect(canChangeAddress("CANCELED")).toBe(false)
  })
})

describe("address change schemas (#45)", () => {
  it("requires the order and the new address", () => {
    expect(
      addressChangeQuoteSchema.safeParse({ orderId, addressId }).success
    ).toBe(true)
    const missing = addressChangeQuoteSchema.safeParse({ orderId })
    expect(missing.success).toBe(false)
    expect(missing.error?.issues[0]?.message).toBe(
      "Escolha o novo endereço de entrega."
    )
  })

  it("requires the option and the price the customer confirmed", () => {
    const valid = {
      orderId,
      addressId,
      option: { method: "CORREIOS_PAC", carrier: "Correios", service: "PAC" },
      expectedShippingPrice: "45.90",
    }
    expect(confirmAddressChangeSchema.safeParse(valid).success).toBe(true)
    expect(
      confirmAddressChangeSchema.safeParse({
        ...valid,
        option: null,
        expectedShippingPrice: "0.00",
      }).success
    ).toBe(true)
    expect(
      confirmAddressChangeSchema.safeParse({
        ...valid,
        expectedShippingPrice: "45,9",
      }).success
    ).toBe(false)
    expect(
      confirmAddressChangeSchema.safeParse({
        ...valid,
        option: { ...valid.option, method: "MANUAL_QUOTE" },
      }).success
    ).toBe(false)
  })
})
