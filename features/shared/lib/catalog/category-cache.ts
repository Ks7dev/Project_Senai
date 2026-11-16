import "server-only"
import { cacheLife, cacheTag } from "next/cache"
import {
  buildCategoryTree,
  type CategoryNode,
} from "@/features/shared/lib/catalog/category-tree"
import { prisma } from "@/features/shared/lib/db/prisma"

/**
 * Every category as a select option, active or not, for back office
 * forms (product category). Indented by depth.
 *
 * @returns Options with id and label.
 */
export async function getCategoryOptions(): Promise<
  Array<{ id: string; label: string }>
> {
  const rows = await prisma.category.findMany({
    select: {
      id: true,
      parentId: true,
      name: true,
      slug: true,
      position: true,
      active: true,
    },
  })
  const options: Array<{ id: string; label: string }> = []
  const walk = (nodes: CategoryNode[], depth: number) => {
    for (const node of nodes) {
      const suffix = node.active ? "" : " (oculta)"
      options.push({
        id: node.id,
        label: `${"— ".repeat(depth)}${node.name}${suffix}`,
      })
      walk(node.children, depth + 1)
    }
  }
  walk(buildCategoryTree(rows), 0)
  return options
}

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
