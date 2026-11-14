import { describe, expect, it, vi } from "vitest"
import {
  priceTableFormSchema,
  volumeDiscountFormSchema,
} from "@/features/cart/price-tables/schema/price-table-schema"
import {
  computeVolumeDiscounts,
  customerUnitCents,
  describeVolumeMinimum,
  discountCents,
  formatPercent,
  LIST_PRICING,
  percentToBasisPoints,
  type CustomerPricing,
  type VolumeRule,
} from "@/features/shared/lib/pricing/pricing-math"
import type { CartExtrasRules } from "@/features/shared/lib/cart/cart-extras"
import { priceTables, volumeDiscounts } from "@/prisma/seed-data"

vi.mock("next/headers", () => ({ cookies: async () => new Map() }))
vi.mock("@/features/shared/lib/auth/session", () => ({
  getCurrentUser: async () => null,
}))
vi.mock("@/features/shared/lib/db/prisma", () => ({ prisma: {} }))

const { summarizeLines, toCartLine } =
  await import("@/features/shared/lib/cart/cart-store")
const { customerPrice, loadCustomerPricing, priceCards } =
  await import("@/features/shared/lib/pricing/customer-pricing")

const productA = "019a7b1e-0000-7000-8000-00000000000a"
const productB = "019a7b1e-0000-7000-8000-00000000000b"
const stationery = "019a7b1e-0000-7000-8000-0000000000c1"
const furniture = "019a7b1e-0000-7000-8000-0000000000c2"

const corporate: CustomerPricing = {
  tableId: "019a7b1e-0000-7000-8000-0000000000f1",
  tableName: "Corporativo",
  defaultBasisPoints: 500,
  productBasisPoints: new Map([[productB, 800]]),
}

const rules: VolumeRule[] = [
  {
    id: "r1",
    categoryId: stationery,
    categoryName: "Papelaria nobre",
    minQuantity: 10,
    minAmountCents: null,
    basisPoints: 500,
  },
  {
    id: "r2",
    categoryId: stationery,
    categoryName: "Papelaria nobre",
    minQuantity: 50,
    minAmountCents: null,
    basisPoints: 1000,
  },
  {
    id: "r3",
    categoryId: furniture,
    categoryName: "Mobiliário ergonômico",
    minQuantity: 4,
    minAmountCents: 2_500_000,
    basisPoints: 600,
  },
]

describe("customer price table (#52, RF21)", () => {
  it("applies the table default and the product override", () => {
    expect(customerUnitCents(38_900, corporate, productA)).toBe(36_955)
    expect(customerUnitCents(980_000, corporate, productB)).toBe(901_600)
  })

  it("keeps the catalog price without a table", () => {
    expect(customerUnitCents(38_900, LIST_PRICING, productA)).toBe(38_900)
    expect(customerPrice("389.00", productA, LIST_PRICING)).toEqual({
      price: "389.00",
      listPrice: null,
    })
  })

  it("rounds discounts to the cent and never below zero", () => {
    expect(discountCents(999, 333)).toBe(33)
    expect(discountCents(100, 0)).toBe(0)
    expect(discountCents(100, 20_000)).toBe(100)
  })

  it("shows the catalog price struck through on cards", () => {
    const cards = priceCards(
      [
        {
          id: productA,
          slug: "caderno",
          name: "Caderno",
          brand: null,
          price: "389.00",
          imageKey: null,
          imageAlt: "Caderno",
          available: true,
          leadTimeDays: 5,
        },
      ],
      corporate
    )
    expect(cards[0]).toMatchObject({ price: "369.55", listPrice: "389.00" })
  })

  it("loads the table of the corporate account for its members", async () => {
    const client = {
      member: {
        findFirst: vi.fn().mockResolvedValue({
          organization: { priceTableId: corporate.tableId },
        }),
      },
      user: { findUnique: vi.fn() },
      priceTable: {
        findFirst: vi.fn().mockResolvedValue({
          id: corporate.tableId,
          name: "Corporativo",
          discountPercent: { toFixed: () => "5.00" },
          items: [
            { productId: productB, discountPercent: { toFixed: () => "8.00" } },
          ],
        }),
      },
    }
    const pricing = await loadCustomerPricing("u1", client as never)
    expect(pricing.tableName).toBe("Corporativo")
    expect(pricing.defaultBasisPoints).toBe(500)
    expect(pricing.productBasisPoints.get(productB)).toBe(800)
    expect(client.user.findUnique).not.toHaveBeenCalled()
    expect(client.priceTable.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: corporate.tableId, active: true, deletedAt: null },
      })
    )
  })

  it("uses the PF table and falls back to the catalog price", async () => {
    const client = {
      member: { findFirst: vi.fn().mockResolvedValue(null) },
      user: { findUnique: vi.fn().mockResolvedValue({ priceTableId: null }) },
      priceTable: { findFirst: vi.fn() },
    }
    expect(await loadCustomerPricing("u2", client as never)).toBe(LIST_PRICING)
    expect(await loadCustomerPricing(null, client as never)).toBe(LIST_PRICING)
    expect(client.priceTable.findFirst).not.toHaveBeenCalled()
  })
})

describe("volume discounts (#52, RN04)", () => {
  it("applies the largest rule reached in each category", () => {
    const applied = computeVolumeDiscounts(
      [
        { categoryId: stationery, quantity: 30, totalCents: 1_000_000 },
        { categoryId: stationery, quantity: 25, totalCents: 500_000 },
      ],
      rules
    )
    expect(applied).toEqual([
      expect.objectContaining({
        ruleId: "r2",
        quantity: 55,
        baseCents: 1_500_000,
        discountCents: 150_000,
      }),
    ])
  })

  it("needs every minimum of the rule", () => {
    const below = computeVolumeDiscounts(
      [{ categoryId: furniture, quantity: 5, totalCents: 2_000_000 }],
      rules
    )
    expect(below).toEqual([])
    const reached = computeVolumeDiscounts(
      [{ categoryId: furniture, quantity: 4, totalCents: 3_000_000 }],
      rules
    )
    expect(reached[0]?.discountCents).toBe(180_000)
  })

  it("ignores rules without a minimum and other categories", () => {
    const applied = computeVolumeDiscounts(
      [{ categoryId: furniture, quantity: 100, totalCents: 100 }],
      [{ ...rules[0]!, categoryId: furniture, minQuantity: null }]
    )
    expect(applied).toEqual([])
  })

  it("describes the minimums and percentages in Portuguese", () => {
    expect(formatPercent(750)).toBe("7,5%")
    expect(formatPercent(1000)).toBe("10%")
    expect(percentToBasisPoints("8.50")).toBe(850)
    expect(describeVolumeMinimum({ minQuantity: 1, minAmount: null })).toBe(
      "a partir de 1 unidade"
    )
    expect(
      describeVolumeMinimum({ minQuantity: 4, minAmount: "25000.00" })
    ).toMatch(/^a partir de 4 unidades e R\$\s25\.000,00$/)
  })
})

const extrasRules: CartExtrasRules = {
  engraving: { price: "90.00", extraBusinessDays: 3, maxLength: 30 },
  services: [],
}

/**
 * Cart item shaped like the cart query.
 *
 * @param productId - Product id.
 * @param categoryId - Category id.
 * @param price - Catalog price.
 * @param quantity - Units.
 * @returns The item.
 */
function item(
  productId: string,
  categoryId: string,
  price: string,
  quantity: number
) {
  return {
    id: `item-${productId}`,
    cartId: "cart",
    skuId: `sku-${productId}`,
    quantity,
    personalization: { type: "laser_engraving", text: "AB", font: "serif" },
    services: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    sku: {
      code: `SKU-${productId.slice(-1)}`,
      name: "Padrão",
      price: null,
      active: true,
      product: {
        id: productId,
        name: "Produto",
        slug: "produto",
        basePrice: { toFixed: () => price },
        status: "ACTIVE",
        deletedAt: null,
        personalizable: true,
        requiresInstallation: false,
        category: { id: categoryId, name: "Papelaria nobre", active: true },
        images: [],
      },
    },
  } as never
}

describe("cart totals with customer prices (#52, RF21, RN04)", () => {
  it("prices lines with the customer table and discounts the products only", () => {
    const line = toCartLine(
      item(productA, stationery, "100.00", 12),
      extrasRules,
      corporate
    )
    expect(line).toMatchObject({
      unitPrice: "95.00",
      listUnitPrice: "100.00",
      total: "1140.00",
      engravingTotal: "1080.00",
    })
    const cart = summarizeLines([line], {
      volumeRules: rules,
      priceTableName: corporate.tableName,
    })
    expect(cart).toMatchObject({
      subtotal: "1140.00",
      discount: "57.00",
      servicesTotal: "1080.00",
      total: "2163.00",
      priceTableName: "Corporativo",
      volumeDiscounts: [
        {
          categoryName: "Papelaria nobre",
          basisPoints: 500,
          quantity: 12,
          amount: "57.00",
        },
      ],
    })
  })

  it("keeps the catalog price and no discount for visitors", () => {
    const line = toCartLine(
      item(productA, stationery, "100.00", 2),
      extrasRules
    )
    expect(line.listUnitPrice).toBeNull()
    const cart = summarizeLines([line])
    expect(cart).toMatchObject({ discount: "0.00", volumeDiscounts: [] })
  })
})

describe("pricing back office forms (#52)", () => {
  it("normalizes percentages and refuses repeated products", () => {
    const parsed = priceTableFormSchema.parse({
      name: " Corporativo ",
      discountPercent: "7,5",
      items: [{ productId: productA, discountPercent: "10" }],
    })
    expect(parsed).toMatchObject({
      name: "Corporativo",
      discountPercent: "7.5",
      active: true,
    })
    const repeated = priceTableFormSchema.safeParse({
      name: "Corporativo",
      discountPercent: "5",
      items: [
        { productId: productA, discountPercent: "1" },
        { productId: productA, discountPercent: "2" },
      ],
    })
    expect(repeated.error?.issues[0]?.message).toBe(
      "Há produtos repetidos na tabela."
    )
  })

  it("caps the discount at 90%", () => {
    const result = priceTableFormSchema.safeParse({
      name: "Exagero",
      discountPercent: "95",
      items: [],
    })
    expect(result.error?.issues[0]?.message).toBe("O desconto máximo é de 90%.")
  })

  it("requires a minimum quantity or amount and a positive discount", () => {
    const base = {
      categoryId: stationery,
      minQuantity: "",
      minAmount: "",
      discountPercent: "5",
    }
    expect(volumeDiscountFormSchema.safeParse(base).error?.issues[0]).toEqual(
      expect.objectContaining({
        message: "Informe a quantidade mínima, o valor mínimo ou os dois.",
      })
    )
    expect(
      volumeDiscountFormSchema.parse({ ...base, minQuantity: "10" })
    ).toMatchObject({ minQuantity: 10, discountPercent: "5" })
    expect(
      volumeDiscountFormSchema.parse({ ...base, minAmount: "2500,00" })
    ).toMatchObject({ minQuantity: null, minAmount: "2500.00" })
    expect(
      volumeDiscountFormSchema.safeParse({
        ...base,
        minQuantity: "10",
        discountPercent: "0",
      }).success
    ).toBe(false)
    expect(
      volumeDiscountFormSchema.safeParse({ ...base, minAmount: "0" }).success
    ).toBe(false)
  })

  it("seeds demo values that pass the same validation", () => {
    for (const table of priceTables) {
      expect(
        priceTableFormSchema.safeParse({
          name: table.name,
          description: table.description,
          discountPercent: table.discountPercent,
          items: [],
        }).success
      ).toBe(true)
    }
    for (const rule of volumeDiscounts) {
      expect(
        volumeDiscountFormSchema.safeParse({
          categoryId: stationery,
          minQuantity:
            rule.minQuantity === null ? "" : String(rule.minQuantity),
          minAmount: rule.minAmount ?? "",
          discountPercent: rule.discountPercent,
        }).success
      ).toBe(true)
    }
  })
})
