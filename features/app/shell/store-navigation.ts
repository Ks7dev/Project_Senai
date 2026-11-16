import "server-only"
import { connection } from "next/server"
import {
  categoryLinks,
  type NavLink,
} from "@/features/shared/config/navigation"
import { getActiveCategoryTree } from "@/features/shared/lib/catalog/category-cache"
import { logger } from "@/features/shared/lib/logger/logger"

/**
 * Top-level categories for the store menu, read from the database so
 * the back office controls the menu (RF01, #23). Falls back to the
 * static list if the database is unavailable, keeping the store usable.
 *
 * @returns Category links.
 */
export async function getMenuCategoryLinks(): Promise<NavLink[]> {
  // Request time only: the menu is never read during the build
  await connection()
  try {
    const tree = await getActiveCategoryTree()
    return tree.map((node) => ({
      label: node.name,
      href: `/categoria/${node.slug}`,
    }))
  } catch (error) {
    logger.error("category menu unavailable, using static links", { error })
    return categoryLinks
  }
}
