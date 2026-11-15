import { describe, expect, it } from "vitest"
import {
  quoteAttachmentsSchema,
  quoteRequestSchema,
} from "@/features/cart/quote-request/schema/quote-request-schema"
import {
  detectQuoteAttachmentType,
  formatFileSize,
  MAX_QUOTE_ATTACHMENT_BYTES,
  safeAttachmentName,
} from "@/features/shared/lib/quotes/quote-attachments"
import { formatQuoteNumber } from "@/features/shared/lib/quotes/quote-number"
import {
  catalogUnitPrice,
  quoteTotals,
} from "@/features/shared/lib/quotes/quote-pricing"

const skuA = "0190f5a0-0000-7000-8000-000000000001"
const skuB = "0190f5a0-0000-7000-8000-000000000002"
const MB = 1024 * 1024

describe("quote request schema (#48, RF05)", () => {
  it("accepts lines and trims the notes", () => {
    const result = quoteRequestSchema.parse({
      lines: [{ skuId: skuA, quantity: 3 }],
      notes: "  Entrega no 5º andar  ",
    })
    expect(result).toEqual({
      lines: [{ skuId: skuA, quantity: 3 }],
      notes: "Entrega no 5º andar",
    })
  })

  it("refuses an empty request, repeated variations and bad quantities", () => {
    expect(quoteRequestSchema.safeParse({ lines: [] }).success).toBe(false)
    expect(
      quoteRequestSchema.safeParse({
        lines: [
          { skuId: skuA, quantity: 1 },
          { skuId: skuA, quantity: 2 },
        ],
      }).success
    ).toBe(false)
    for (const quantity of [0, 1.5, 1000]) {
      expect(
        quoteRequestSchema.safeParse({ lines: [{ skuId: skuB, quantity }] })
          .success
      ).toBe(false)
    }
  })
})

describe("quote attachments (#48, RF08)", () => {
  it("accepts PDF and images within the limits", () => {
    expect(
      quoteAttachmentsSchema.safeParse([
        { name: "planta.pdf", type: "application/pdf", size: 2 * MB },
        { name: "foto.jpg", type: "image/jpeg", size: 1 * MB },
      ]).success
    ).toBe(true)
  })

  it("refuses other types, large files, too many files and a large total", () => {
    const pdf = { name: "a.pdf", type: "application/pdf", size: MB }
    expect(
      quoteAttachmentsSchema.safeParse([
        { name: "a.exe", type: "application/x-msdownload", size: 10 },
      ]).success
    ).toBe(false)
    expect(
      quoteAttachmentsSchema.safeParse([
        { ...pdf, size: MAX_QUOTE_ATTACHMENT_BYTES + 1 },
      ]).success
    ).toBe(false)
    expect(
      quoteAttachmentsSchema.safeParse(Array.from({ length: 6 }, () => pdf))
        .success
    ).toBe(false)
    const result = quoteAttachmentsSchema.safeParse(
      Array.from({ length: 3 }, () => ({ ...pdf, size: 4 * MB }))
    )
    expect(result.success).toBe(false)
    expect(result.error?.issues[0]?.message).toContain("somam mais de 10 MB")
  })

  it("detects the real type from the file signature", () => {
    const bytes = (...values: number[]) => new Uint8Array(values)
    expect(
      detectQuoteAttachmentType(new TextEncoder().encode("%PDF-1.7"))
    ).toBe("application/pdf")
    expect(
      detectQuoteAttachmentType(
        bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)
      )
    ).toBe("image/png")
    expect(detectQuoteAttachmentType(bytes(0xff, 0xd8, 0xff, 0xe0))).toBe(
      "image/jpeg"
    )
    expect(
      detectQuoteAttachmentType(new TextEncoder().encode("RIFF1234WEBPVP8 "))
    ).toBe("image/webp")
    expect(detectQuoteAttachmentType(bytes(0x4d, 0x5a, 0x90, 0x00))).toBe(null)
  })

  it("keeps only a safe file name", () => {
    expect(safeAttachmentName("C:\\Users\\x\\planta<1>.pdf")).toBe(
      "planta1.pdf"
    )
    expect(safeAttachmentName("../../")).toBe("anexo")
    expect(safeAttachmentName("a".repeat(300))).toHaveLength(191)
  })

  it("formats sizes for the customer", () => {
    expect(formatFileSize(500)).toBe("1 KB")
    expect(formatFileSize(1.5 * MB)).toBe("1,5 MB")
  })
})

describe("quote numbers and totals (RF06)", () => {
  it("formats the readable number", () => {
    expect(formatQuoteNumber(2026, 123)).toBe("COT-2026-000123")
  })

  it("sums the lines in cents with discount and shipping", () => {
    expect(
      quoteTotals(
        [
          { quantity: 3, unitPrice: "0.10" },
          { quantity: 2, unitPrice: "1999.90" },
        ],
        { discount: "100.00", shippingTotal: "45.50" }
      )
    ).toEqual({
      subtotal: "4000.10",
      discount: "100.00",
      shippingTotal: "45.50",
      total: "3945.60",
    })
    expect(() =>
      quoteTotals([{ quantity: 1, unitPrice: "10.00" }], { discount: "11" })
    ).toThrow()
  })

  it("uses the variation price, or the product base price", () => {
    const decimal = (value: string) => ({ toFixed: () => value })
    expect(
      catalogUnitPrice({
        price: decimal("120.00"),
        product: { basePrice: decimal("100.00") },
      })
    ).toBe("120.00")
    expect(
      catalogUnitPrice({
        price: null,
        product: { basePrice: decimal("100.00") },
      })
    ).toBe("100.00")
  })
})
