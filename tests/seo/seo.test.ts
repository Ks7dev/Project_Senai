import { beforeEach, describe, expect, it, vi } from "vitest"

const categoryFindMany = vi.fn()
const productFindMany = vi.fn()

vi.mock("next/cache", () => ({ cacheLife: vi.fn(), cacheTag: vi.fn() }))
vi.mock("next/server", () => ({ connection: vi.fn(async () => {}) }))
vi.mock("@/features/shared/lib/db/prisma", () => ({
  prisma: {
    category: { findMany: (a: unknown) => categoryFindMany(a) },
    product: { findMany: (a: unknown) => productFindMany(a) },
  },
}))

const { buildProductJsonLd, excerpt, serializeJsonLd } =
  await import("@/features/shared/lib/seo/product-json-ld")
const { buildSitemap, DISALLOWED_PATHS } =
  await import("@/features/shared/lib/seo/sitemap")
const { default: robots } = await import("@/app/robots")

const BASE = "https://loja.test"

const product = {
  slug: "caneta-tinteiro-ebano",
  name: "Caneta tinteiro Ébano",
  description: "Caneta tinteiro em ébano maciço,\n\npena de ouro 18k.",
  brand: "Atelier",
  category: { name: "Escrita fina" },
  price: "1890.00",
  images: [{ key: "products/abc/1", alt: "Caneta tinteiro de ébano" }],
  skus: [
    { code: "CT-EB-01", name: "Pena fina", price: "1890.00", available: 3 },
  ],
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, "error").mockImplementation(() => {})
  process.env.BETTER_AUTH_URL = `${BASE}/`
})

describe("Product structured data (RNF14)", () => {
  it("builds a valid schema.org/Product with a single Offer", () => {
    const data = buildProductJsonLd(product, BASE)
    expect(data).toEqual({
      "@context": "https://schema.org",
      "@type": "Product",
      name: "Caneta tinteiro Ébano",
      description: "Caneta tinteiro em ébano maciço, pena de ouro 18k.",
      url: `${BASE}/produto/caneta-tinteiro-ebano`,
      sku: "CT-EB-01",
      image: [`${BASE}/media/products/abc/1-1024.webp`],
      category: "Escrita fina",
      brand: { "@type": "Brand", name: "Atelier" },
      offers: {
        "@type": "Offer",
        sku: "CT-EB-01",
        name: "Pena fina",
        price: "1890.00",
        priceCurrency: "BRL",
        availability: "https://schema.org/InStock",
        itemCondition: "https://schema.org/NewCondition",
        url: `${BASE}/produto/caneta-tinteiro-ebano`,
        seller: { "@type": "Organization", name: "Atelier Bureau" },
      },
    })
  })

  it("uses an AggregateOffer with the price range for several SKUs", () => {
    const data = buildProductJsonLd(
      {
        ...product,
        brand: null,
        skus: [
          { code: "A", name: "Nogueira", price: "4200.00", available: 0 },
          { code: "B", name: "Carvalho", price: "3990.50", available: 0 },
        ],
      },
      BASE
    )
    expect(data.brand).toBeUndefined()
    expect(data.sku).toBeUndefined()
    expect(data.offers).toMatchObject({
      "@type": "AggregateOffer",
      priceCurrency: "BRL",
      lowPrice: "3990.50",
      highPrice: "4200.00",
      offerCount: 2,
      availability: "https://schema.org/BackOrder",
    })
  })

  it("falls back to the base price when the product has no active SKU", () => {
    const data = buildProductJsonLd({ ...product, skus: [] }, BASE)
    expect(data.offers).toMatchObject({
      "@type": "Offer",
      price: "1890.00",
      availability: "https://schema.org/BackOrder",
    })
  })

  it("has every property Google requires for a product snippet", () => {
    const data = buildProductJsonLd(product, BASE)
    for (const key of ["name", "image", "offers"] as const) {
      expect(data[key]).toBeTruthy()
    }
    const offer = data.offers as { price: string; priceCurrency: string }
    expect(offer.price).toMatch(/^\d+\.\d{2}$/)
    expect(offer.priceCurrency).toBe("BRL")
  })

  it("never lets product text close the script tag", () => {
    const json = serializeJsonLd({ name: "</script><script>alert(1)" })
    expect(json).not.toContain("<")
    expect(JSON.parse(json)).toEqual({ name: "</script><script>alert(1)" })
  })

  it("cuts long descriptions at a word boundary", () => {
    const text = "palavra ".repeat(40)
    const result = excerpt(text, 50)
    expect(result.length).toBeLessThanOrEqual(50)
    expect(result.endsWith("…")).toBe(true)
    expect(result).not.toContain("  ")
  })
})

describe("sitemap and robots (RNF14)", () => {
  it("lists home, quote, active categories and published products", async () => {
    const updatedAt = new Date("2026-11-10T12:00:00Z")
    categoryFindMany.mockResolvedValue([{ slug: "escrita-fina", updatedAt }])
    productFindMany.mockResolvedValue([
      { slug: "caneta-tinteiro-ebano", updatedAt },
    ])
    const entries = await buildSitemap()
    expect(entries.map((entry) => entry.url)).toEqual([
      BASE,
      `${BASE}/cotacao/nova`,
      `${BASE}/categoria/escrita-fina`,
      `${BASE}/produto/caneta-tinteiro-ebano`,
    ])
    expect(entries[3].lastModified).toEqual(updatedAt)
    expect(productFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          status: "ACTIVE",
          deletedAt: null,
          category: { active: true },
        },
      })
    )
  })

  it("falls back to the static categories when the database fails", async () => {
    categoryFindMany.mockRejectedValue(new Error("db down"))
    productFindMany.mockResolvedValue([])
    const entries = await buildSitemap()
    expect(entries[0].url).toBe(BASE)
    expect(entries.some((entry) => entry.url.includes("/categoria/"))).toBe(
      true
    )
  })

  it("blocks private areas and points to the sitemap", async () => {
    const result = await robots()
    expect(result.sitemap).toBe(`${BASE}/sitemap.xml`)
    expect(result.rules).toMatchObject({ userAgent: "*", allow: "/" })
    for (const path of ["/admin", "/conta", "/checkout", "/api"]) {
      expect(DISALLOWED_PATHS).toContain(path)
    }
  })
})
