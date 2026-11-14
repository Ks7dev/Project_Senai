import "server-only"
import { cacheLife, cacheTag } from "next/cache"
import {
  INSTITUTIONAL_CACHE_TAG,
  INSTITUTIONAL_TITLES,
  type InstitutionalPageContent,
  type InstitutionalSlug,
} from "@/features/shared/lib/content/institutional-pages"
import { prisma } from "@/features/shared/lib/db/prisma"

/**
 * Institutional page saved in the back office (RF57). Cached and
 * invalidated when the admin saves, so changes appear without a deploy.
 *
 * @param slug - Page route.
 * @returns The page; empty body when it was never saved.
 */
export async function getInstitutionalPage(
  slug: InstitutionalSlug
): Promise<InstitutionalPageContent> {
  "use cache"
  cacheTag(INSTITUTIONAL_CACHE_TAG)
  cacheLife("hours")
  const row = await prisma.institutionalPage.findUnique({ where: { slug } })
  return {
    slug,
    title: row?.title ?? INSTITUTIONAL_TITLES[slug],
    body: row?.body ?? "",
    updatedAt: row?.updatedAt.toISOString() ?? null,
  }
}
