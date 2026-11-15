import { describe, expect, it } from "vitest"
import {
  centsToMoney,
  MAX_LINE_QUANTITY,
  mergeQuantity,
  moneyToCents,
} from "@/features/shared/lib/cart/cart-math"
import { addToCartSchema } from "@/features/shared/schema/cart-schema"
import {
  saveProjectListSchema,
  updateCartItemSchema,
} from "@/features/cart/cart-page/schema/cart-page-schema"

describe("cart quantities (#46)", () => {
  it("sums the visitor and account quantities of the same SKU", () => {
    expect(mergeQuantity(2, 3)).toBe(5)
    expect(mergeQuantity(0, 1)).toBe(1)
  })

  it("never passes the line limit", () => {
    expect(mergeQuantity(MAX_LINE_QUANTITY, 5)).toBe(MAX_LINE_QUANTITY)
    expect(mergeQuantity(-3, 2)).toBe(2)
  })

  it("adds money as integer cents", () => {
    expect(centsToMoney(moneyToCents("0.10") + moneyToCents("0.20"))).toBe(
      "0.30"
    )
    expect(centsToMoney(moneyToCents("389.00") * 3)).toBe("1167.00")
  })
})

describe("cart schemas (#46)", () => {
  it("defaults the quantity to one and rejects invalid quantities", () => {
    expect(addToCartSchema.parse({ skuCode: " PAP-1 " })).toEqual({
      skuCode: "PAP-1",
      quantity: 1,
    })
    expect(
      addToCartSchema.safeParse({ skuCode: "PAP-1", quantity: 1.5 }).success
    ).toBe(false)
    expect(
      updateCartItemSchema.safeParse({
        itemId: "0196f0a0-0000-7000-8000-000000000000",
        quantity: MAX_LINE_QUANTITY + 1,
      }).success
    ).toBe(false)
  })

  it("requires a list name", () => {
    const result = saveProjectListSchema.safeParse({ name: " " })
    expect(result.success).toBe(false)
    expect(result.error?.issues[0]?.message).toBe(
      "Dê um nome à lista, com ao menos 2 caracteres."
    )
  })
})
