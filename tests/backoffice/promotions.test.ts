import { beforeEach, describe, expect, it, vi } from "vitest"
import {
  promotionFormSchema,
  saoPauloLocalToDate,
  toSaoPauloLocal,
} from "@/features/backoffice/promotions/schema/promotion-schema"
import { applyCouponSchema } from "@/features/cart/cart-page/schema/cart-page-schema"
import {
  applyFreeShipping,
  categoryLineage,
  freeShippingReason,
  isPromotionActive,
  lineDiscountCents,
  pricePromotions,
  type PromotionLine,
  type PromotionRule,
} from "@/features/shared/lib/promotions/promotion-math"

const now = new Date("2026-11-14T15:00:00.000Z")

/**
 * Builds a promotion rule valid around `now`.
 *
 * @param overrides - Fields to change.
 * @returns The rule.
 */
function rule(overrides: Partial<PromotionRule> = {}): PromotionRule {
  return {
    id: "p1",
    name: "Semana do escritório",
    scope: "PRODUCT",
    productId: "prod-1",
    categoryId: null,
    couponCode: null,
    discountType: "PERCENT",
    discountValue: "10.00",
    freeShipping: false,
    minOrderTotal: null,
    startsAt: new Date("2026-11-01T03:00:00.000Z"),
    endsAt: new Date("2026-11-30T02:59:00.000Z"),
    active: true,
    ...overrides,
  }
}

const lines: PromotionLine[] = [
  {
    id: "l1",
    productId: "prod-1",
    categoryIds: ["cat-pens", "cat-writing"],
    quantity: 2,
    unitPrice: "1290.00",
    total: "2580.00",
    purchasable: true,
  },
  {
    id: "l2",
    productId: "prod-2",
    categoryIds: ["cat-paper"],
    quantity: 1,
    unitPrice: "389.00",
    total: "389.00",
    purchasable: true,
  },
]

describe("promotion validity (#73, RF46)", () => {
  it("is only active inside the validity, both ends included", () => {
    const promo = rule()
    expect(isPromotionActive(promo, now)).toBe(true)
    expect(isPromotionActive(promo, promo.startsAt)).toBe(true)
    expect(isPromotionActive(promo, promo.endsAt)).toBe(true)
    expect(
      isPromotionActive(promo, new Date(promo.startsAt.getTime() - 1))
    ).toBe(false)
    expect(isPromotionActive(promo, new Date(promo.endsAt.getTime() + 1))).toBe(
      false
    )
    expect(isPromotionActive(rule({ active: false }), now)).toBe(false)
  })

  it("ignores product promotions out of the validity", () => {
    const pricing = pricePromotions({
      lines,
      cartTotal: "2969.00",
      rules: [rule({ endsAt: new Date("2026-11-10T00:00:00.000Z") })],
      couponCode: null,
      coupon: null,
      now,
    })
    expect(pricing.discount).toBe("0.00")
    expect(pricing.applied).toEqual([])
  })
})

describe("promotion pricing (#73, RF46)", () => {
  it("applies a percent product discount to the matching line", () => {
    const pricing = pricePromotions({
      lines,
      cartTotal: "2969.00",
      rules: [rule()],
      couponCode: null,
      coupon: null,
      now,
    })
    expect(pricing.discount).toBe("258.00")
    expect(pricing.lineDiscounts).toEqual({ l1: "258.00" })
    expect(pricing.applied).toEqual([
      {
        id: "p1",
        name: "Semana do escritório",
        amount: "258.00",
        freeShipping: false,
      },
    ])
  })

  it("reaches subcategories through the category lineage", () => {
    const parents = new Map<string, string | null>([
      ["cat-pens", "cat-writing"],
      ["cat-writing", null],
    ])
    expect(categoryLineage(parents, "cat-pens")).toEqual([
      "cat-pens",
      "cat-writing",
    ])
    const pricing = pricePromotions({
      lines,
      cartTotal: "2969.00",
      rules: [
        rule({
          id: "c1",
          scope: "CATEGORY",
          productId: null,
          categoryId: "cat-writing",
          discountType: "FIXED",
          discountValue: "100.00",
        }),
      ],
      couponCode: null,
      coupon: null,
      now,
    })
    expect(pricing.discount).toBe("200.00")
  })

  it("keeps only the best promotion of a line", () => {
    const pricing = pricePromotions({
      lines,
      cartTotal: "2969.00",
      rules: [
        rule(),
        rule({
          id: "c1",
          scope: "CATEGORY",
          productId: null,
          categoryId: "cat-pens",
          discountValue: "20.00",
        }),
      ],
      couponCode: null,
      coupon: null,
      now,
    })
    expect(pricing.discount).toBe("516.00")
    expect(pricing.applied.map((item) => item.id)).toEqual(["c1"])
  })

  it("never discounts more than the line", () => {
    expect(
      lineDiscountCents(
        { discountType: "FIXED", discountValue: "500.00" },
        { quantity: 1, total: "389.00" }
      )
    ).toBe(38900)
  })

  it("respects the minimum order of a promotion", () => {
    const pricing = pricePromotions({
      lines,
      cartTotal: "2969.00",
      rules: [rule({ minOrderTotal: "5000.00" })],
      couponCode: null,
      coupon: null,
      now,
    })
    expect(pricing.discount).toBe("0.00")
  })

  it("applies a coupon on what is left after the line discounts", () => {
    const coupon = rule({
      id: "cp",
      name: "Cupom BEMVINDO10",
      scope: "COUPON",
      productId: null,
      couponCode: "BEMVINDO10",
    })
    const pricing = pricePromotions({
      lines,
      cartTotal: "2969.00",
      rules: [rule()],
      couponCode: "bemvindo10",
      coupon,
      now,
    })
    // 258.00 on the pen, then 10% of (2322.00 + 389.00) = 271.10
    expect(pricing.discount).toBe("529.10")
    expect(pricing.coupon).toEqual({ code: "BEMVINDO10", status: "applied" })
  })

  it("explains why a coupon does not apply", () => {
    const base = {
      lines,
      cartTotal: "2969.00",
      rules: [],
      couponCode: "BEMVINDO10",
      now,
    }
    const coupon = rule({
      scope: "COUPON",
      productId: null,
      couponCode: "BEMVINDO10",
    })
    expect(pricePromotions({ ...base, coupon: null }).coupon?.status).toBe(
      "not_found"
    )
    expect(
      pricePromotions({ ...base, coupon: { ...coupon, active: false } }).coupon
        ?.status
    ).toBe("expired")
    expect(
      pricePromotions({
        ...base,
        coupon: { ...coupon, minOrderTotal: "3000.00" },
      }).coupon?.status
    ).toBe("min_not_reached")
  })
})

describe("free shipping (#73, RN23)", () => {
  it("grants courtesy shipping only from a configured rule", () => {
    const withCourtesy = pricePromotions({
      lines,
      cartTotal: "2969.00",
      rules: [rule({ discountValue: "0.00", freeShipping: true })],
      couponCode: null,
      coupon: null,
      now,
    })
    expect(withCourtesy.courtesyShipping).toBe(true)
    expect(withCourtesy.discount).toBe("0.00")
    const without = pricePromotions({
      lines,
      cartTotal: "2969.00",
      rules: [rule()],
      couponCode: null,
      coupon: null,
      now,
    })
    expect(without.courtesyShipping).toBe(false)
  })

  it("is free when the order reaches the region minimum", () => {
    expect(
      freeShippingReason({
        courtesyShipping: false,
        regionMinimum: "5000.00",
        orderTotal: "5000.00",
      })
    ).toBe("regional_minimum")
    expect(
      freeShippingReason({
        courtesyShipping: false,
        regionMinimum: "5000.00",
        orderTotal: "4999.99",
      })
    ).toBeNull()
    expect(
      freeShippingReason({
        courtesyShipping: false,
        regionMinimum: null,
        orderTotal: "99999.00",
      })
    ).toBeNull()
    expect(
      freeShippingReason({
        courtesyShipping: true,
        regionMinimum: null,
        orderTotal: "10.00",
      })
    ).toBe("promotion")
  })

  it("zeroes the options and keeps the original price", () => {
    const options = [
      { service: "PAC", price: "45.90" },
      { service: "SEDEX", price: "89.00" },
    ]
    expect(applyFreeShipping(options, null)).toBe(options)
    expect(applyFreeShipping(options, "regional_minimum")).toEqual([
      {
        service: "PAC",
        price: "0.00",
        originalPrice: "45.90",
        freeShippingReason: "regional_minimum",
      },
      {
        service: "SEDEX",
        price: "0.00",
        originalPrice: "89.00",
        freeShippingReason: "regional_minimum",
      },
    ])
  })
})

describe("promotion form (#73)", () => {
  const valid = {
    name: "Semana do escritório",
    scope: "COUPON" as const,
    productId: "",
    categoryId: "",
    couponCode: " bem vindo10 ",
    discountType: "PERCENT" as const,
    discountValue: "10",
    freeShipping: false,
    minOrderTotal: "1.000,00".replace(".", ""),
    startsAt: "2026-11-01T00:00",
    endsAt: "2026-11-30T23:59",
    active: true,
  }

  it("normalizes the coupon, money and São Paulo dates", () => {
    const parsed = promotionFormSchema.parse(valid)
    expect(parsed.couponCode).toBe("BEMVINDO10")
    expect(parsed.minOrderTotal).toBe("1000.00")
    expect(parsed.startsAt.toISOString()).toBe("2026-11-01T03:00:00.000Z")
    expect(toSaoPauloLocal(saoPauloLocalToDate("2026-11-30T23:59"))).toBe(
      "2026-11-30T23:59"
    )
  })

  it("refuses an end before the start and percents above 100", () => {
    expect(
      promotionFormSchema.safeParse({ ...valid, endsAt: "2026-10-01T00:00" })
        .error?.issues[0]?.message
    ).toBe("O fim da vigência deve ser depois do início.")
    expect(
      promotionFormSchema.safeParse({ ...valid, discountValue: "120" }).error
        ?.issues[0]?.message
    ).toBe("O percentual vai até 100.")
  })

  it("requires the target of the scope and a benefit", () => {
    expect(
      promotionFormSchema.safeParse({ ...valid, scope: "PRODUCT" }).error
        ?.issues[0]?.message
    ).toBe("Escolha o produto.")
    expect(
      promotionFormSchema.safeParse({ ...valid, discountValue: "0" }).error
        ?.issues[0]?.message
    ).toBe("Informe o desconto ou marque o frete cortesia.")
    expect(
      promotionFormSchema.safeParse({
        ...valid,
        discountValue: "0",
        freeShipping: true,
      }).success
    ).toBe(true)
  })

  it("normalizes the coupon typed in the cart", () => {
    expect(applyCouponSchema.parse({ code: " bemvindo10 " }).code).toBe(
      "BEMVINDO10"
    )
    expect(applyCouponSchema.safeParse({ code: "x" }).success).toBe(false)
  })
})

const getCurrentUser = vi.fn()
const rolePermissionFindMany = vi.fn()
const promotionFindFirst = vi.fn()
const promotionUpdate = vi.fn()
const promotionCreate = vi.fn()
const productFindFirst = vi.fn()
const auditCreate = vi.fn()

vi.mock("@/features/shared/lib/auth/session", () => ({
  getCurrentUser: () => getCurrentUser(),
}))
const tx = {
  promotion: {
    findFirst: (a: unknown) => promotionFindFirst(a),
    update: (a: unknown) => promotionUpdate(a),
    create: (a: unknown) => promotionCreate(a),
  },
  product: { findFirst: (a: unknown) => productFindFirst(a) },
  category: { findUnique: vi.fn() },
  auditLog: { create: (a: unknown) => auditCreate(a) },
}
vi.mock("@/features/shared/lib/db/prisma", () => ({
  prisma: {
    ...tx,
    rolePermission: { findMany: (a: unknown) => rolePermissionFindMany(a) },
    $transaction: async (fn: (client: typeof tx) => Promise<unknown>) => fn(tx),
  },
}))

const { savePromotion, deletePromotion } =
  await import("@/features/backoffice/promotions/action/promotion-actions")

describe("promotion actions (#73)", () => {
  const saved = {
    id: "019a7b1e-0000-7000-8000-000000000010",
    name: "Canetas",
    scope: "PRODUCT",
    productId: "019a7b1e-0000-7000-8000-000000000011",
    categoryId: null,
    couponCode: null,
    discountType: "PERCENT",
    discountValue: { toFixed: () => "10.00" },
    freeShipping: false,
    minOrderTotal: null,
    startsAt: new Date("2026-11-01T03:00:00.000Z"),
    endsAt: new Date("2026-12-01T02:59:00.000Z"),
    active: true,
  }

  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(console, "error").mockImplementation(() => {})
    vi.spyOn(console, "warn").mockImplementation(() => {})
    getCurrentUser.mockResolvedValue({ id: "u-admin", name: "A", email: "a@b" })
    rolePermissionFindMany.mockResolvedValue([
      { permission: { resource: "promotion", action: "manage" } },
    ])
    productFindFirst.mockResolvedValue({ id: saved.productId })
    promotionCreate.mockResolvedValue(saved)
  })

  it("refuses users without promotion:manage", async () => {
    rolePermissionFindMany.mockResolvedValue([])
    const result = await deletePromotion({ id: saved.id })
    expect(result).toEqual({
      success: false,
      error: "Você não tem permissão para esta ação.",
    })
    expect(promotionUpdate).not.toHaveBeenCalled()
  })

  it("creates a product promotion and audits it", async () => {
    const result = await savePromotion({
      name: "Canetas",
      scope: "PRODUCT",
      productId: saved.productId,
      categoryId: "",
      couponCode: "IGNORADO",
      discountType: "PERCENT",
      discountValue: "10",
      freeShipping: false,
      minOrderTotal: "",
      startsAt: "2026-11-01T00:00",
      endsAt: "2026-11-30T23:59",
      active: true,
    })
    expect(result).toEqual({ success: true, id: saved.id })
    expect(promotionCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        productId: saved.productId,
        categoryId: null,
        couponCode: null,
        discountValue: "10",
      }),
    })
    expect(auditCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: "u-admin",
        action: "promotion.create",
        entity: "promotion",
      }),
    })
  })

  it("soft deletes and frees the coupon code", async () => {
    promotionFindFirst.mockResolvedValue(saved)
    const result = await deletePromotion({ id: saved.id })
    expect(result).toEqual({ success: true })
    expect(promotionUpdate).toHaveBeenCalledWith({
      where: { id: saved.id },
      data: expect.objectContaining({ active: false, couponCode: null }),
    })
  })
})
