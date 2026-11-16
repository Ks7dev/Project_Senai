import { describe, expect, it } from "vitest"
import {
  buildCategoryTree,
  createsCycle,
  reorderSiblings,
  type CategoryRow,
} from "@/features/shared/lib/catalog/category-tree"
import { slugify } from "@/features/shared/lib/text/slug"

const row = (
  id: string,
  parentId: string | null,
  position: number,
  active = true
): CategoryRow => ({ id, parentId, name: id, slug: id, position, active })

describe("category tree (#23, RF01)", () => {
  const rows = [
    row("mobiliario", null, 1),
    row("papelaria", null, 0),
    row("cadeiras", "mobiliario", 1),
    row("mesas", "mobiliario", 0),
    row("oculta", null, 2, false),
    row("filha-da-oculta", "oculta", 0),
  ]

  it("orders categories and nests subcategories", () => {
    const tree = buildCategoryTree(rows)
    expect(tree.map((n) => n.id)).toEqual(["papelaria", "mobiliario", "oculta"])
    expect(tree[1].children.map((n) => n.id)).toEqual(["mesas", "cadeiras"])
  })

  it("hides inactive categories and their subtree in the store", () => {
    const ids = buildCategoryTree(rows, true).map((n) => n.id)
    expect(ids).not.toContain("oculta")
    expect(JSON.stringify(buildCategoryTree(rows, true))).not.toContain(
      "filha-da-oculta"
    )
  })

  it("prevents placing a category inside its own subtree", () => {
    expect(createsCycle(rows, "mobiliario", "cadeiras")).toBe(true)
    expect(createsCycle(rows, "mobiliario", "mobiliario")).toBe(true)
    expect(createsCycle(rows, "mesas", "papelaria")).toBe(false)
  })

  it("swaps positions with the neighbour and stops at the edges", () => {
    const siblings = rows.filter((r) => r.parentId === "mobiliario")
    expect(reorderSiblings(siblings, "cadeiras", "up")).toEqual([
      { id: "cadeiras", position: 0 },
      { id: "mesas", position: 1 },
    ])
    expect(reorderSiblings(siblings, "mesas", "up")).toBeNull()
    expect(reorderSiblings(siblings, "cadeiras", "down")).toBeNull()
  })
})

describe("slugify", () => {
  it("removes accents and joins words with hyphens", () => {
    expect(slugify("Organização de Mesa")).toBe("organizacao-de-mesa")
    expect(slugify("  Iluminação & Luminárias ")).toBe("iluminacao-luminarias")
  })
})
