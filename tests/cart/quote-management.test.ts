import { describe, expect, it } from "vitest"
import {
  answerQuoteSchema,
  convertQuoteSchema,
  quoteQueueSchema,
} from "@/features/cart/quote-management/schema/quote-management-schema"
import { quoteTotals } from "@/features/shared/lib/quotes/quote-pricing"

const quoteId = "0190f5a0-0000-7000-8000-000000000010"
const itemA = "0190f5a0-0000-7000-8000-000000000011"
const itemB = "0190f5a0-0000-7000-8000-000000000012"
const addressId = "0190f5a0-0000-7000-8000-000000000013"

describe("quote answer schema (#50, RF20)", () => {
  it("normalizes the negotiated values to decimal strings", () => {
    const result = answerQuoteSchema.parse({
      quoteId,
      lines: [
        { itemId: itemA, unitPrice: "1234,5" },
        { itemId: itemB, unitPrice: " 89.90 " },
      ],
      discount: "0",
      shippingTotal: "35,00",
      note: "  Entrega em duas etapas.  ",
    })
    expect(result.lines).toEqual([
      { itemId: itemA, unitPrice: "1234.50" },
      { itemId: itemB, unitPrice: "89.90" },
    ])
    expect(result.discount).toBe("0.00")
    expect(result.shippingTotal).toBe("35.00")
    expect(result.note).toBe("Entrega em duas etapas.")
  })

  it("refuses free items, bad money, repeated lines and no lines", () => {
    const base = { quoteId, discount: "0", shippingTotal: "0" }
    for (const unitPrice of ["0", "", "abc", "-5", "1.234,56", "10,999"]) {
      expect(
        answerQuoteSchema.safeParse({
          ...base,
          lines: [{ itemId: itemA, unitPrice }],
        }).success
      ).toBe(false)
    }
    expect(
      answerQuoteSchema.safeParse({
        ...base,
        lines: [
          { itemId: itemA, unitPrice: "10" },
          { itemId: itemA, unitPrice: "12" },
        ],
      }).success
    ).toBe(false)
    expect(answerQuoteSchema.safeParse({ ...base, lines: [] }).success).toBe(
      false
    )
    expect(
      answerQuoteSchema.safeParse({
        ...base,
        discount: "-1",
        lines: [{ itemId: itemA, unitPrice: "10" }],
      }).success
    ).toBe(false)
  })
})

describe("quote conversion schema (#50, RF20)", () => {
  const base = {
    quoteId,
    addressId,
    paymentMethod: "PIX" as const,
    shippingMethod: "CARRIER" as const,
  }

  it("has no price field: the order keeps the values of the quote", () => {
    const result = convertQuoteSchema.parse({
      ...base,
      total: "1.00",
      unitPrice: "1.00",
    })
    expect(result).toEqual({
      ...base,
      carrier: "",
      deliveryDays: null,
      installationDate: null,
    })
  })

  it("reads the delivery time and the installation date", () => {
    const result = convertQuoteSchema.parse({
      ...base,
      carrier: " Transportadora Fictícia ",
      deliveryDays: "12",
      installationDate: "2026-12-01",
    })
    expect(result).toMatchObject({
      carrier: "Transportadora Fictícia",
      deliveryDays: 12,
      installationDate: "2026-12-01",
    })
  })

  it("refuses invoiced payment, the manual method and bad dates", () => {
    expect(
      convertQuoteSchema.safeParse({ ...base, paymentMethod: "INVOICED" })
        .success
    ).toBe(false)
    expect(
      convertQuoteSchema.safeParse({ ...base, shippingMethod: "MANUAL_QUOTE" })
        .success
    ).toBe(false)
    expect(
      convertQuoteSchema.safeParse({ ...base, installationDate: "01/12/2026" })
        .success
    ).toBe(false)
    expect(
      convertQuoteSchema.safeParse({ ...base, deliveryDays: "0" }).success
    ).toBe(false)
  })
})

describe("quote queue filters (#50, RF20)", () => {
  it("shows the open quotes by default", () => {
    expect(quoteQueueSchema.parse({})).toEqual({ filter: "OPEN", search: "" })
    expect(quoteQueueSchema.safeParse({ filter: "PAID" }).success).toBe(false)
  })
})

describe("negotiated totals (#50, RF20)", () => {
  it("sums the negotiated lines, the discount and the shipping in cents", () => {
    expect(
      quoteTotals(
        [
          { quantity: 3, unitPrice: "90.10" },
          { quantity: 1, unitPrice: "0.20" },
        ],
        { discount: "20.00", shippingTotal: "35.05" }
      )
    ).toEqual({
      subtotal: "270.50",
      discount: "20.00",
      shippingTotal: "35.05",
      total: "285.55",
    })
  })
})
