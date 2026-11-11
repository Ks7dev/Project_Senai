import "server-only"
import { cacheLife, cacheTag } from "next/cache"
import {
  buildCategoryTree,
  type CategoryNode,
} from "@/features/shared/lib/catalog/category-tree"
import { prisma } from "@/features/shared/lib/db/prisma"

/** Cache tag invalidated whenever a category changes. */
export const CATEGORIES_CACHE_TAG = "categories"

/**
 * Active category tree for the store menu and filters (RF01). Cached
 * and invalidated by the category actions, so menu changes made in the
 * back office show up without code changes.
 *
 * @returns Active top-level categories with their active children.
 */
export async function getActiveCategoryTree(): Promise<CategoryNode[]> {
  "use cache"
  cacheTag(CATEGORIES_CACHE_TAG)
  cacheLife("hours")
  const rows = await prisma.category.findMany({
    where: { active: true },
    select: {
      id: true,
      parentId: true,
      name: true,
      slug: true,
      position: true,
      active: true,
    },
  })
  return buildCategoryTree(rows, true)
}
