/** Minimal category row used to build the tree. */
export type CategoryRow = {
  /** Category id. */
  id: string
  /** Parent id, or null for top-level categories. */
  parentId: string | null
  /** Display name. */
  name: string
  /** URL slug. */
  slug: string
  /** Order among siblings. */
  position: number
  /** Whether it shows in the store. */
  active: boolean
}

/** A category with its children, in display order. */
export type CategoryNode = CategoryRow & {
  /** Subcategories. */
  children: CategoryNode[]
}

/**
 * Builds the category tree ordered by position, then name (RF01).
 *
 * @param rows - Flat category rows.
 * @param onlyActive - Drop inactive categories and their subtrees.
 * @returns Top-level categories with nested children.
 */
export function buildCategoryTree(
  rows: CategoryRow[],
  onlyActive = false
): CategoryNode[] {
  const visible = onlyActive ? rows.filter((row) => row.active) : rows
  const byParent = new Map<string | null, CategoryRow[]>()
  for (const row of visible) {
    const siblings = byParent.get(row.parentId) ?? []
    siblings.push(row)
    byParent.set(row.parentId, siblings)
  }
  const build = (parentId: string | null): CategoryNode[] =>
    (byParent.get(parentId) ?? [])
      .sort((a, b) => a.position - b.position || a.name.localeCompare(b.name))
      .map((row) => ({ ...row, children: build(row.id) }))
  return build(null)
}

/**
 * Whether making `parentId` the parent of `id` would create a cycle
 * (a category inside its own subtree).
 *
 * @param rows - Flat category rows.
 * @param id - Category being moved.
 * @param parentId - New parent.
 * @returns True when the change is not allowed.
 */
export function createsCycle(
  rows: Pick<CategoryRow, "id" | "parentId">[],
  id: string,
  parentId: string | null
): boolean {
  const parentOf = new Map(rows.map((row) => [row.id, row.parentId]))
  let current = parentId
  while (current) {
    if (current === id) return true
    current = parentOf.get(current) ?? null
  }
  return false
}

/**
 * Swaps the position of a category with its neighbour among siblings.
 *
 * @param siblings - Categories with the same parent.
 * @param id - Category to move.
 * @param direction - "up" or "down".
 * @returns New positions for every sibling, or null when it cannot move.
 */
export function reorderSiblings(
  siblings: Pick<CategoryRow, "id" | "position" | "name">[],
  id: string,
  direction: "up" | "down"
): Array<{ id: string; position: number }> | null {
  const ordered = [...siblings].sort(
    (a, b) => a.position - b.position || a.name.localeCompare(b.name)
  )
  const index = ordered.findIndex((row) => row.id === id)
  const target = direction === "up" ? index - 1 : index + 1
  if (index < 0 || target < 0 || target >= ordered.length) return null
  ;[ordered[index], ordered[target]] = [ordered[target], ordered[index]]
  return ordered.map((row, position) => ({ id: row.id, position }))
}
