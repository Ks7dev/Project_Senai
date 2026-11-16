import { describe, expect, it } from "vitest"
import {
  restockSchema,
  stockFiltersSchema,
} from "@/features/orders/stock/schema/stock-schema"
import {
  availableQuantity,
  groupBySku,
  outstandingReservations,
} from "@/features/shared/lib/stock/stock-math"

describe("available stock (#64, RF44)", () => {
  it("discounts reservations and never goes below zero", () => {
    expect(availableQuantity({ onHand: 10, reserved: 3 })).toBe(7)
    expect(availableQuantity({ onHand: 2, reserved: 5 })).toBe(0)
    expect(availableQuantity(null)).toBe(0)
    expect(availableQuantity(undefined)).toBe(0)
  })
})

describe("outstanding reservations of an order (#64, RF43)", () => {
  it("keeps only what was reserved and not yet released or written off", () => {
    const result = outstandingReservations([
      { skuId: "a", type: "RESERVE", quantity: 3 },
      { skuId: "a", type: "WRITE_OFF", quantity: 3 },
      { skuId: "b", type: "RESERVE", quantity: 2 },
      { skuId: "c", type: "RESERVE", quantity: 4 },
      { skuId: "c", type: "RELEASE", quantity: 1 },
      { skuId: "c", type: "RESTOCK", quantity: 10 },
    ])
    expect(Object.fromEntries(result)).toEqual({ b: 2, c: 3 })
  })
})

describe("grouping order lines by SKU", () => {
  it("adds quantities and sorts by SKU id to lock in a stable order", () => {
    expect(
      groupBySku([
        { skuId: "z", quantity: 1 },
        { skuId: "a", quantity: 2 },
        { skuId: "z", quantity: 3 },
      ])
    ).toEqual([
      { skuId: "a", quantity: 2 },
      { skuId: "z", quantity: 4 },
    ])
  })
})

describe("restock form (#64)", () => {
  const skuId = "0195f0c2-6b1a-7d4e-9a3b-1c2d3e4f5a6b"

  it("accepts whole units and a reason", () => {
    expect(
      restockSchema.parse({ skuId, quantity: " 12 ", note: " NF 55 " })
    ).toEqual({ skuId, quantity: 12, note: "NF 55" })
  })

  it("refuses zero, fractions and a missing reason", () => {
    expect(
      restockSchema.safeParse({ skuId, quantity: "0", note: "NF 55" }).success
    ).toBe(false)
    expect(
      restockSchema.safeParse({ skuId, quantity: "1,5", note: "NF 55" }).success
    ).toBe(false)
    expect(
      restockSchema.safeParse({ skuId, quantity: "3", note: "" }).success
    ).toBe(false)
  })

  it("defaults the list filters", () => {
    expect(stockFiltersSchema.parse({})).toEqual({
      search: "",
      onlyUnavailable: false,
    })
  })
})
