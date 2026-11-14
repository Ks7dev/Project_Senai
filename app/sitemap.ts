import type { MetadataRoute } from "next"
import { buildSitemap } from "@/features/shared/lib/seo/sitemap"

/**
 * `/sitemap.xml` generated from the catalog (RNF14, #31).
 *
 * @returns Sitemap entries.
 */
export default function sitemap(): Promise<MetadataRoute.Sitemap> {
  return buildSitemap()
}
