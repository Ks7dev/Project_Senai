import "server-only"
import type { MetadataRoute } from "next"
import { cacheLife, cacheTag } from "next/cache"
import { connection } from "next/server"
import { categoryLinks } from "@/features/shared/config/navigation"
import { CATEGORIES_CACHE_TAG } from "@/features/shared/lib/catalog/category-cache"
import { PRODUCTS_CACHE_TAG } from "@/features/shared/lib/catalog/product-cache"
import { prisma } from "@/features/shared/lib/db/prisma"
import { siteUrl } from "@/features/shared/lib/email/site-url"
import { logger } from "@/features/shared/lib/logger/logger"

/** Public pages that are always listed in the sitemap. */
export const STATIC_SITEMAP_PATHS = ["/", "/cotacao/nova"] as const

/** Indexable catalog paths with their last change. */
export type CatalogPath = { path: string; updatedAt: Date | null }

/**
 * Active categories and published products as friendly paths
 * (`/categoria/<slug>`, `/produto/<slug>`). Cached and invalidated with
 * the catalog tags, so the sitemap follows the back office.
 *
 * @returns Catalog paths.
 */
async function loadCatalogPaths(): Promise<CatalogPath[]> {
  "use cache"
  cacheTag(PRODUCTS_CACHE_TAG, CATEGORIES_CACHE_TAG)
  cacheLife("hours")
  const [categories, products] = await Promise.all([
    prisma.category.findMany({
      where: { active: true },
      select: { slug: true, updatedAt: true },
      orderBy: { position: "asc" },
    }),
    prisma.product.findMany({
      where: { status: "ACTIVE", deletedAt: null, category: { active: true } },
      select: { slug: true, updatedAt: true },
      orderBy: { updatedAt: "desc" },
    }),
  ])
  return [
    ...categories.map((category) => ({
      path: `/categoria/${category.slug}`,
      updatedAt: category.updatedAt,
    })),
    ...products.map((product) => ({
      path: `/produto/${product.slug}`,
      updatedAt: product.updatedAt,
    })),
  ]
}

/**
 * Turns paths into sitemap entries with absolute URLs.
 *
 * @param paths - Store paths.
 * @param baseUrl - Public URL of the store, without a trailing slash.
 * @returns Sitemap entries.
 */
export function toSitemapEntries(
  paths: CatalogPath[],
  baseUrl: string
): MetadataRoute.Sitemap {
  return paths.map(({ path, updatedAt }) => ({
    url: `${baseUrl}${path === "/" ? "" : path}`,
    ...(updatedAt ? { lastModified: updatedAt } : {}),
    changeFrequency: path.startsWith("/produto/") ? "weekly" : "daily",
    priority: path === "/" ? 1 : path.startsWith("/categoria/") ? 0.8 : 0.6,
  }))
}

/**
 * Sitemap of the store (RNF14, #31), generated on each request from the
 * catalog: home, quote request, active categories and published
 * products. Falls back to the static menu categories when the database
 * is unavailable.
 *
 * @returns Sitemap entries.
 */
export async function buildSitemap(): Promise<MetadataRoute.Sitemap> {
  // Request time only: the catalog is never read during the build
  await connection()
  const base = siteUrl()
  const statics: CatalogPath[] = STATIC_SITEMAP_PATHS.map((path) => ({
    path,
    updatedAt: null,
  }))
  try {
    return toSitemapEntries([...statics, ...(await loadCatalogPaths())], base)
  } catch (error) {
    logger.error("sitemap catalog unavailable, using static links", { error })
    return toSitemapEntries(
      [
        ...statics,
        ...categoryLinks.map((link) => ({ path: link.href, updatedAt: null })),
      ],
      base
    )
  }
}

/** Private areas that search engines must not crawl. */
export const DISALLOWED_PATHS = [
  "/admin",
  "/api",
  "/conta",
  "/carrinho",
  "/checkout",
  "/convite",
  "/entrar",
  "/cadastro",
  "/recuperar-senha",
  "/redefinir-senha",
  "/busca",
  "/comparar",
] as const
