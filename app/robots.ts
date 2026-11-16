import type { MetadataRoute } from "next"
import { connection } from "next/server"
import { siteUrl } from "@/features/shared/lib/email/site-url"
import { DISALLOWED_PATHS } from "@/features/shared/lib/seo/sitemap"

/**
 * `/robots.txt` (RNF14, #31): public catalog crawlable, private areas
 * (account, cart, checkout, back office, API) blocked, and the sitemap
 * address. Built at request time so it uses the runtime public URL.
 *
 * @returns Robots rules.
 */
export default async function robots(): Promise<MetadataRoute.Robots> {
  await connection()
  return {
    rules: { userAgent: "*", allow: "/", disallow: [...DISALLOWED_PATHS] },
    sitemap: `${siteUrl()}/sitemap.xml`,
  }
}
