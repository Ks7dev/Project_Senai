import "server-only"
import { cacheLife, cacheTag } from "next/cache"
import { CATEGORIES_CACHE_TAG } from "@/features/shared/lib/catalog/category-cache"
import { PRODUCTS_CACHE_TAG } from "@/features/shared/lib/catalog/product-cache"
import { prisma } from "@/features/shared/lib/db/prisma"
import {
  customerPrice,
  loadCurrentCustomerPricing,
  loadVolumeTiers,
  type VolumeTier,
} from "@/features/shared/lib/pricing/customer-pricing"
import { availableQuantity } from "@/features/shared/lib/stock/stock-math"

/** Everything the product page shows (RF03). */
export type ProductPageData = {
  id: string
  slug: string
  name: string
  description: string
  brand: string | null
  category: { name: string; slug: string }
  price: string
  specs: Array<{ label: string; value: string }>
  warrantyMonths: number
  includesExtendedWarranty: boolean
  leadTimeDays: number
  requiresInstallation: boolean
  personalizable: boolean
  limitedEdition: boolean
  lotNumber: string | null
  images: Array<{ key: string; alt: string }>
  datasheets: Array<{ name: string; key: string }>
  manuals: Array<{ name: string; key: string }>
  certifications: Array<{ name: string; key: string }>
  skus: Array<{
    code: string
    name: string
    price: string
    available: number
  }>
}

/**
 * Loads a published product by slug for the product page. Inactive or
 * draft products are not shown (RF42). Cached and invalidated when the
 * product changes.
 *
 * @param slug - Product slug.
 * @returns The page data, or null when not found or not published.
 */
export async function loadProductPage(
  slug: string
): Promise<ProductPageData | null> {
  "use cache"
  cacheTag(PRODUCTS_CACHE_TAG, CATEGORIES_CACHE_TAG)
  cacheLife("minutes")

  const product = await prisma.product.findFirst({
    where: {
      slug,
      status: "ACTIVE",
      deletedAt: null,
      category: { active: true },
    },
    include: {
      category: { select: { name: true, slug: true } },
      images: { orderBy: { position: "asc" } },
      documents: { orderBy: { createdAt: "asc" } },
      skus: {
        where: { active: true },
        include: { stock: true },
        orderBy: { createdAt: "asc" },
      },
    },
  })
  if (!product) return null

  const documents = (kind: string) =>
    product.documents
      .filter((document) => document.kind === kind)
      .map((document) => ({ name: document.name, key: document.storageKey }))

  return {
    id: product.id,
    slug: product.slug,
    name: product.name,
    description: product.description,
    brand: product.brand,
    category: product.category,
    price: product.basePrice.toFixed(2),
    specs: Object.entries((product.specs ?? {}) as Record<string, string>).map(
      ([label, value]) => ({ label, value: String(value) })
    ),
    warrantyMonths: product.warrantyMonths,
    includesExtendedWarranty: product.includesExtendedWarranty,
    leadTimeDays: product.leadTimeDays,
    requiresInstallation: product.requiresInstallation,
    personalizable: product.personalizable,
    limitedEdition: product.limitedEdition,
    lotNumber: product.lotNumber,
    images: product.images.map((image) => ({
      key: image.storageKey,
      alt: image.alt,
    })),
    datasheets: documents("DATASHEET"),
    manuals: documents("MANUAL"),
    certifications: documents("CERTIFICATION"),
    skus: product.skus.map((sku) => ({
      code: sku.code,
      name: sku.name,
      price: (sku.price ?? product.basePrice).toFixed(2),
      available: availableQuantity(sku.stock),
    })),
  }
}

/** Product page with the prices of the logged-in customer (RF21, RN04). */
export type CustomerProductPageData = Omit<ProductPageData, "skus"> & {
  /** Catalog price when the customer table lowers it, otherwise null. */
  listPrice: string | null
  /** Variations with the customer price and the catalog price. */
  skus: Array<ProductPageData["skus"][number] & { listPrice: string | null }>
  /** Name of the customer price table, or null. */
  priceTableName: string | null
  /** Volume discount tiers of the product category (RN04). */
  volumeTiers: VolumeTier[]
}

/**
 * Loads the product page and applies the price table of the logged-in
 * customer (RF21) and the volume discount tiers of the category (RN04).
 * The product comes from the shared cache with the catalog price; the
 * customer price is applied per request and never cached.
 *
 * @param slug - Product slug.
 * @returns The page data, or null when not found or not published.
 */
export async function loadProductPageForCustomer(
  slug: string
): Promise<CustomerProductPageData | null> {
  const product = await loadProductPage(slug)
  if (!product) return null
  const [pricing, volumeTiers] = await Promise.all([
    loadCurrentCustomerPricing(),
    loadVolumeTiers(product.category.slug),
  ])
  return {
    ...product,
    ...customerPrice(product.price, product.id, pricing),
    skus: product.skus.map((sku) => ({
      ...sku,
      ...customerPrice(sku.price, product.id, pricing),
    })),
    priceTableName: pricing.tableName,
    volumeTiers,
  }
}
