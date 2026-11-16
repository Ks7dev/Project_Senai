import { beforeEach, describe, expect, it, vi } from "vitest"

const getCurrentUser = vi.fn()
const productFindFirst = vi.fn()
const favoriteUpsert = vi.fn()
const favoriteDeleteMany = vi.fn()
const favoriteFindMany = vi.fn()

vi.mock("@/features/shared/lib/auth/session", () => ({
  getCurrentUser: () => getCurrentUser(),
}))
vi.mock("@/features/shared/lib/db/prisma", () => ({
  prisma: {
    product: { findFirst: (a: unknown) => productFindFirst(a) },
    favorite: {
      upsert: (a: unknown) => favoriteUpsert(a),
      deleteMany: (a: unknown) => favoriteDeleteMany(a),
      findMany: (a: unknown) => favoriteFindMany(a),
    },
  },
}))

const storage = new Map<string, string>()
vi.stubGlobal("localStorage", {
  getItem: (key: string) => storage.get(key) ?? null,
  setItem: (key: string, value: string) => storage.set(key, value),
})
vi.stubGlobal("window", {
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
})

const { setFavorite, listMyFavoriteIds } =
  await import("@/features/shared/lib/favorites/favorite-actions")
const { toggleCompare, clearCompare, getCompareSnapshot, MAX_COMPARE } =
  await import("@/features/shared/lib/compare/compare-store")
const { buildComparisonRows } =
  await import("@/features/shared/lib/catalog/comparison-rows")
const { swatchColor } = await import("@/components/commerce/material-swatches")

const PRODUCT_ID = "0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b"

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, "error").mockImplementation(() => {})
  getCurrentUser.mockResolvedValue({ id: "u1", name: "Ana", email: "a@b.test" })
  productFindFirst.mockResolvedValue({ id: PRODUCT_ID })
})

describe("favorites (RF45)", () => {
  it("saves a favorite for the session user", async () => {
    const result = await setFavorite({ productId: PRODUCT_ID, favorite: true })
    expect(result).toEqual({ success: true, favorite: true })
    expect(favoriteUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: { userId: "u1", productId: PRODUCT_ID },
      })
    )
  })

  it("removes a favorite only for the session user", async () => {
    await setFavorite({ productId: PRODUCT_ID, favorite: false })
    expect(favoriteDeleteMany).toHaveBeenCalledWith({
      where: { userId: "u1", productId: PRODUCT_ID },
    })
  })

  it("asks visitors to log in", async () => {
    getCurrentUser.mockResolvedValue(null)
    const result = await setFavorite({ productId: PRODUCT_ID, favorite: true })
    expect(result.success).toBe(false)
    expect(favoriteUpsert).not.toHaveBeenCalled()
  })

  it("refuses a product that does not exist", async () => {
    productFindFirst.mockResolvedValue(null)
    const result = await setFavorite({ productId: PRODUCT_ID, favorite: true })
    expect(result).toEqual({
      success: false,
      error: "Produto não encontrado.",
    })
  })

  it("rejects an invalid product id", async () => {
    const result = await setFavorite({ productId: "1; drop", favorite: true })
    expect(result.success).toBe(false)
    expect(productFindFirst).not.toHaveBeenCalled()
  })

  it("lists nothing for visitors", async () => {
    getCurrentUser.mockResolvedValue(null)
    expect(await listMyFavoriteIds()).toEqual({
      success: true,
      productIds: [],
    })
    expect(favoriteFindMany).not.toHaveBeenCalled()
  })
})

describe("comparison (RF04)", () => {
  beforeEach(() => clearCompare())

  it("keeps up to four products and refuses a fifth", () => {
    for (let i = 1; i <= MAX_COMPARE; i++) {
      expect(toggleCompare({ slug: `p${i}`, name: `P${i}` })).toBe("added")
    }
    expect(toggleCompare({ slug: "p5", name: "P5" })).toBe("limit")
    expect(getCompareSnapshot()).toHaveLength(MAX_COMPARE)
  })

  it("removes a product toggled twice and persists in storage", () => {
    toggleCompare({ slug: "a", name: "A" })
    toggleCompare({ slug: "b", name: "B" })
    expect(toggleCompare({ slug: "a", name: "A" })).toBe("removed")
    expect(JSON.parse(storage.get("atelier-bureau:compare")!)).toEqual([
      { slug: "b", name: "B" },
    ])
  })

  it("aligns specifications by attribute, with a dash when missing", () => {
    const base = {
      id: "1",
      brand: null,
      imageKey: null,
      imageAlt: "",
      available: true,
      leadTimeDays: 5,
      warrantyMonths: 12,
    }
    const rows = buildComparisonRows([
      {
        ...base,
        slug: "a",
        name: "A",
        price: "100.00",
        specs: { Peso: "2 kg" },
      },
      {
        ...base,
        slug: "b",
        name: "B",
        price: "200.00",
        available: false,
        specs: { Altura: "75 cm" },
      },
    ])
    const byLabel = Object.fromEntries(rows.map((r) => [r.label, r.values]))
    expect(byLabel.Peso).toEqual(["2 kg", "—"])
    expect(byLabel.Altura).toEqual(["—", "75 cm"])
    expect(byLabel.Disponibilidade).toEqual(["Em estoque", "Sob encomenda"])
    expect(byLabel.Marca).toEqual(["—", "—"])
  })
})

describe("material swatches (#16)", () => {
  it("maps known materials and falls back to a neutral tone", () => {
    expect(swatchColor(" Nogueira ")).toBe("#5b3a29")
    expect(swatchColor("Desconhecido")).toBe("#cfc8bb")
  })
})
