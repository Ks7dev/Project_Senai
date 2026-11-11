import { describe, expect, it } from "vitest"
import {
  filtersToQuery,
  parseCatalogFilters,
  toggleValue,
} from "@/features/shared/lib/catalog/catalog-filters"
import {
  buildProductWhere,
  countMaterials,
  escapeLike,
  productOrderBy,
} from "@/features/shared/lib/catalog/catalog-query"

describe("catalog filters from the URL (#24, RF02)", () => {
  it("parses combined filters and ignores invalid values", () => {
    const filters = parseCatalogFilters({
      q: "  caneta ",
      marca: ["Atelier Bureau", "Outra"],
      material: "Nogueira",
      min: "100,50",
      max: "abc",
      prazo: "ate-15-dias",
      ordem: "invalida",
      pagina: "-3",
    })
    expect(filters).toMatchObject({
      q: "caneta",
      marca: ["Atelier Bureau", "Outra"],
      material: ["Nogueira"],
      min: 100.5,
      max: undefined,
      prazo: "ate-15-dias",
      ordem: "recentes",
      pagina: 1,
    })
  })

  it("round-trips filters through the query string", () => {
    const filters = parseCatalogFilters({
      marca: ["A", "B"],
      prazo: "pronta-entrega",
      ordem: "menor-preco",
    })
    const params = new URLSearchParams(filtersToQuery(filters, { pagina: 2 }))
    expect(params.getAll("marca")).toEqual(["A", "B"])
    expect(params.get("prazo")).toBe("pronta-entrega")
    expect(params.get("ordem")).toBe("menor-preco")
    expect(params.get("pagina")).toBe("2")
    const back = parseCatalogFilters(
      Object.fromEntries(
        [...new Set(params.keys())].map((key) => [key, params.getAll(key)])
      )
    )
    expect(back.marca).toEqual(["A", "B"])
  })

  it("omits defaults from the query string", () => {
    expect(filtersToQuery(parseCatalogFilters({}))).toBe("")
  })

  it("toggles multi-value filters", () => {
    expect(toggleValue(["a"], "b")).toEqual(["a", "b"])
    expect(toggleValue(["a", "b"], "a")).toEqual(["b"])
  })
})

describe("product query (#24, #25)", () => {
  it("only lists published, not deleted products of active categories (RF42)", () => {
    const where = buildProductWhere(parseCatalogFilters({}))
    expect(where.AND).toContainEqual({
      status: "ACTIVE",
      deletedAt: null,
      category: { active: true },
    })
  })

  it("searches name, description, brand and SKU code", () => {
    const where = buildProductWhere(parseCatalogFilters({ q: "nogueira" }))
    const search = (where.AND as Array<Record<string, unknown>>).find(
      (part) => "OR" in part
    ) as { OR: unknown[] }
    expect(search.OR).toHaveLength(4)
  })

  it("also matches the products found by technical specification", () => {
    const where = buildProductWhere(
      parseCatalogFilters({ q: "pólen" }),
      undefined,
      undefined,
      ["p1", "p2"]
    )
    const search = (where.AND as Array<Record<string, unknown>>).find(
      (part) => "OR" in part
    ) as { OR: unknown[] }
    expect(search.OR).toContainEqual({ id: { in: ["p1", "p2"] } })
  })

  it("escapes LIKE wildcards typed by the user", () => {
    expect(escapeLike("50%_off\\")).toBe("50\\%\\_off\\\\")
  })

  it("leaves out one filter when counting its facet", () => {
    const filters = parseCatalogFilters({ marca: "A", prazo: "ate-30-dias" })
    const full = JSON.stringify(buildProductWhere(filters))
    const withoutBrand = JSON.stringify(
      buildProductWhere(filters, undefined, "brand")
    )
    expect(full).toContain('"brand":{"in"')
    expect(withoutBrand).not.toContain('"brand":{"in"')
    expect(withoutBrand).toContain("leadTimeDays")
  })

  it("restricts to the category subtree", () => {
    const where = buildProductWhere(parseCatalogFilters({}), ["c1", "c2"])
    expect(where.AND).toContainEqual({ categoryId: { in: ["c1", "c2"] } })
  })

  it("sorts by price and name", () => {
    expect(productOrderBy("menor-preco")[0]).toEqual({ basePrice: "asc" })
    expect(productOrderBy("maior-preco")[0]).toEqual({ basePrice: "desc" })
    expect(productOrderBy("nome")[0]).toEqual({ name: "asc" })
  })

  it("counts products per material once, across SKUs", () => {
    expect(
      countMaterials([
        { productId: "p1", attributes: { acabamento: "Nogueira" } },
        { productId: "p1", attributes: { acabamento: "Nogueira" } },
        { productId: "p2", attributes: { acabamento: "Nogueira" } },
        { productId: "p2", attributes: { cor: "Grafite" } },
        { productId: "p3", attributes: null },
      ])
    ).toEqual([
      { value: "Grafite", count: 1 },
      { value: "Nogueira", count: 2 },
    ])
  })
})
