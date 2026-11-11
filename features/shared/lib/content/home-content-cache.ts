import "server-only"
import { cacheLife, cacheTag } from "next/cache"
import {
  CONTENT_CACHE_TAG,
  HOME_CONTENT_KEY,
  parseHomeContent,
  type HomeContent,
} from "@/features/shared/lib/content/home-content"
import { prisma } from "@/features/shared/lib/db/prisma"

/**
 * Home content saved in the back office (RF47). Cached and invalidated
 * when the admin saves, so changes appear without a deploy.
 *
 * @returns The home content (default when nothing was saved).
 */
export async function getHomeContent(): Promise<HomeContent> {
  "use cache"
  cacheTag(CONTENT_CACHE_TAG)
  cacheLife("hours")
  const row = await prisma.setting.findUnique({
    where: { key: HOME_CONTENT_KEY },
  })
  return parseHomeContent(row?.value)
}
