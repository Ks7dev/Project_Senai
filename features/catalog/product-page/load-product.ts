import "server-only"
import { cacheLife, cacheTag } from "next/cache"
import { CATEGORIES_CACHE_TAG } from "@/features/shared/lib/catalog/category-cache"
import { PRODUCTS_CACHE_TAG } from "@/features/shared/lib/catalog/product-cache"
import { prisma } from "@/features/shared/lib/db/prisma"
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
    certifications: documents("CERTIFICATION"),
    skus: product.skus.map((sku) => ({
      code: sku.code,
      name: sku.name,
      price: (sku.price ?? product.basePrice).toFixed(2),
      available: availableQuantity(sku.stock),
    })),
  }
}
