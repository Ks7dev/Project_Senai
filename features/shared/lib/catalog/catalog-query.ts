import "server-only"
import { cacheLife, cacheTag } from "next/cache"
import type { Prisma } from "@/generated/prisma/client"
import {
  LEAD_TIME_OPTIONS,
  MATERIAL_ATTRIBUTE_KEYS,
  PAGE_SIZE,
  type CatalogFilters,
} from "@/features/shared/lib/catalog/catalog-filters"
import { PRODUCTS_CACHE_TAG } from "@/features/shared/lib/catalog/product-cache"
import { CATEGORIES_CACHE_TAG } from "@/features/shared/lib/catalog/category-cache"
import { prisma } from "@/features/shared/lib/db/prisma"

/** Product summary shown in cards (listing, search, favorites). */
export type ProductCardData = {
  id: string
  slug: string
  name: string
  brand: string | null
  price: string
  imageKey: string | null
  imageAlt: string
  available: boolean
  leadTimeDays: number
}

/** A facet value and how many products match it. */
export type FacetCount = { value: string; count: number }

/** Listing result with facets for the filter sidebar. */
export type CatalogPage = {
  products: ProductCardData[]
  total: number
  page: number
  pageCount: number
  brands: FacetCount[]
  materials: FacetCount[]
  leadTimes: FacetCount[]
}

type FilterPart = "brand" | "material" | "price" | "leadTime"

/**
 * Builds the Prisma filter of the listing: only published, not deleted
 * products (RF42), in the given categories, matching the search text
 * (accent and case insensitive through the utf8mb4_0900_ai_ci
 * collation) and every active filter except `skip`, used to count
 * facet values.
 *
 * @param filters - Parsed filters.
 * @param categoryIds - Category subtree ids, or undefined for all.
 * @param skip - Filter to ignore (for facet counts).
 * @returns The Prisma where clause.
 */
export function buildProductWhere(
  filters: CatalogFilters,
  categoryIds?: string[],
  skip?: FilterPart
): Prisma.ProductWhereInput {
  const and: Prisma.ProductWhereInput[] = [
    { status: "ACTIVE", deletedAt: null, category: { active: true } },
  ]
  if (categoryIds) and.push({ categoryId: { in: categoryIds } })
  if (filters.q) {
    const q = filters.q
    and.push({
      OR: [
        { name: { contains: q } },
        { description: { contains: q } },
        { brand: { contains: q } },
        { skus: { some: { code: { contains: q.toUpperCase() } } } },
      ],
    })
  }
  if (skip !== "brand" && filters.marca.length > 0) {
    and.push({ brand: { in: filters.marca } })
  }
  if (skip !== "material" && filters.material.length > 0) {
    and.push({
      skus: {
        some: {
          active: true,
          OR: MATERIAL_ATTRIBUTE_KEYS.flatMap((key) =>
            filters.material.map((value) => ({
              attributes: { path: `$.${key}`, equals: value },
            }))
          ),
        },
      },
    })
  }
  if (skip !== "price") {
    if (filters.min !== undefined) {
      and.push({ basePrice: { gte: filters.min } })
    }
    if (filters.max !== undefined) {
      and.push({ basePrice: { lte: filters.max } })
    }
  }
  if (skip !== "leadTime" && filters.prazo) {
    and.push({
      leadTimeDays: { lte: LEAD_TIME_OPTIONS[filters.prazo].maxDays },
    })
  }
  return { AND: and }
}

/**
 * Prisma order by for a sort key.
 *
 * @param sort - Sort key from the URL.
 * @returns The order by clause.
 */
export function productOrderBy(
  sort: CatalogFilters["ordem"]
): Prisma.ProductOrderByWithRelationInput[] {
  switch (sort) {
    case "menor-preco":
      return [{ basePrice: "asc" }, { name: "asc" }]
    case "maior-preco":
      return [{ basePrice: "desc" }, { name: "asc" }]
    case "nome":
      return [{ name: "asc" }]
    default:
      return [{ createdAt: "desc" }]
  }
}

const cardSelect = {
  id: true,
  slug: true,
  name: true,
  brand: true,
  basePrice: true,
  leadTimeDays: true,
  images: {
    select: { storageKey: true, alt: true },
    orderBy: { position: "asc" },
    take: 1,
  },
  skus: {
    where: { active: true },
    select: { stock: { select: { onHand: true, reserved: true } } },
  },
} satisfies Prisma.ProductSelect

/**
 * Converts a product row into card data. Available means at least one
 * active SKU with stock on hand above the reserved quantity.
 *
 * @param row - Product row with the card selection.
 * @returns Card data.
 */
function toCard(
  row: Prisma.ProductGetPayload<{ select: typeof cardSelect }>
): ProductCardData {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    brand: row.brand,
    price: row.basePrice.toFixed(2),
    imageKey: row.images[0]?.storageKey ?? null,
    imageAlt: row.images[0]?.alt ?? row.name,
    available: row.skus.some(
      (sku) => (sku.stock?.onHand ?? 0) - (sku.stock?.reserved ?? 0) > 0
    ),
    leadTimeDays: row.leadTimeDays,
  }
}

/**
 * Ids of a category and all its descendants, so a parent category
 * lists the products of its subcategories.
 *
 * @param slug - Category slug.
 * @returns The category and its subtree ids, or null if not found.
 */
export async function getCategoryWithSubtree(slug: string): Promise<{
  id: string
  name: string
  slug: string
  ids: string[]
} | null> {
  "use cache"
  cacheTag(CATEGORIES_CACHE_TAG)
  cacheLife("hours")
  const all = await prisma.category.findMany({
    where: { active: true },
    select: { id: true, parentId: true, name: true, slug: true },
  })
  const root = all.find((category) => category.slug === slug)
  if (!root) return null
  const ids = [root.id]
  for (let i = 0; i < ids.length; i++) {
    for (const child of all) if (child.parentId === ids[i]) ids.push(child.id)
  }
  return { id: root.id, name: root.name, slug: root.slug, ids }
}

/**
 * Loads one page of the listing with the facet counts of the filter
 * sidebar (RF02). Cached per filter combination and invalidated when
 * products change.
 *
 * @param filters - Parsed filters.
 * @param categoryIds - Category subtree, or undefined for every product.
 * @returns Products, totals and facets.
 */
export async function queryCatalog(
  filters: CatalogFilters,
  categoryIds?: string[]
): Promise<CatalogPage> {
  "use cache"
  cacheTag(PRODUCTS_CACHE_TAG, CATEGORIES_CACHE_TAG)
  cacheLife("minutes")

  const where = buildProductWhere(filters, categoryIds)
  const [total, rows, brandRows, materialRows, leadTimeRows] =
    await Promise.all([
      prisma.product.count({ where }),
      prisma.product.findMany({
        where,
        select: cardSelect,
        orderBy: productOrderBy(filters.ordem),
        skip: (filters.pagina - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
      }),
      prisma.product.groupBy({
        by: ["brand"],
        where: buildProductWhere(filters, categoryIds, "brand"),
        _count: { _all: true },
      }),
      prisma.sku.findMany({
        where: {
          active: true,
          product: buildProductWhere(filters, categoryIds, "material"),
        },
        select: { productId: true, attributes: true },
      }),
      prisma.product.findMany({
        where: buildProductWhere(filters, categoryIds, "leadTime"),
        select: { leadTimeDays: true },
      }),
    ])

  return {
    products: rows.map(toCard),
    total,
    page: filters.pagina,
    pageCount: Math.max(1, Math.ceil(total / PAGE_SIZE)),
    brands: brandRows
      .filter((row) => row.brand)
      .map((row) => ({ value: row.brand!, count: row._count._all }))
      .sort((a, b) => a.value.localeCompare(b.value)),
    materials: countMaterials(materialRows),
    leadTimes: Object.entries(LEAD_TIME_OPTIONS).map(([key, option]) => ({
      value: key,
      count: leadTimeRows.filter((row) => row.leadTimeDays <= option.maxDays)
        .length,
    })),
  }
}

/**
 * Counts, per material or finish value, how many products have an
 * active SKU with it.
 *
 * @param rows - SKUs with their product id and attributes.
 * @returns Facet counts sorted by value.
 */
export function countMaterials(
  rows: Array<{ productId: string; attributes: unknown }>
): FacetCount[] {
  const products = new Map<string, Set<string>>()
  for (const row of rows) {
    const attributes = (row.attributes ?? {}) as Record<string, unknown>
    for (const key of MATERIAL_ATTRIBUTE_KEYS) {
      const value = attributes[key]
      if (typeof value !== "string" || !value) continue
      const set = products.get(value) ?? new Set<string>()
      set.add(row.productId)
      products.set(value, set)
    }
  }
  return [...products.entries()]
    .map(([value, ids]) => ({ value, count: ids.size }))
    .sort((a, b) => a.value.localeCompare(b.value))
}

/**
 * Search suggestions: categories and product names that contain the
 * typed text (RF02).
 *
 * @param q - Search text.
 * @returns Up to 4 categories and 6 product names.
 */
export async function searchSuggestions(q: string): Promise<{
  categories: Array<{ name: string; slug: string }>
  products: Array<{ name: string; slug: string }>
}> {
  "use cache"
  cacheTag(PRODUCTS_CACHE_TAG, CATEGORIES_CACHE_TAG)
  cacheLife("minutes")
  const [categories, products] = await Promise.all([
    prisma.category.findMany({
      where: { active: true, name: { contains: q } },
      select: { name: true, slug: true },
      take: 4,
    }),
    prisma.product.findMany({
      where: { status: "ACTIVE", deletedAt: null, name: { contains: q } },
      select: { name: true, slug: true },
      take: 6,
    }),
  ])
  return { categories, products }
}

/**
 * Product cards for a list of slugs, in the given order, skipping
 * products that are not published (home showcases, RF47).
 *
 * @param slugs - Product slugs chosen in the back office.
 * @returns Cards of the published products.
 */
export async function getProductCardsBySlugs(
  slugs: string[]
): Promise<ProductCardData[]> {
  "use cache"
  cacheTag(PRODUCTS_CACHE_TAG, CATEGORIES_CACHE_TAG)
  cacheLife("minutes")
  if (slugs.length === 0) return []
  const rows = await prisma.product.findMany({
    where: {
      slug: { in: slugs },
      status: "ACTIVE",
      deletedAt: null,
      category: { active: true },
    },
    select: cardSelect,
  })
  const bySlug = new Map(rows.map((row) => [row.slug, toCard(row)]))
  return slugs.flatMap((slug) => bySlug.get(slug) ?? [])
}
