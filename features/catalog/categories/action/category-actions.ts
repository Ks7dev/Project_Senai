"use server"

import { revalidateTag } from "next/cache"
import {
  categoryFormSchema,
  moveCategorySchema,
  toggleCategorySchema,
  type CategoryFormInput,
  type MoveCategoryInput,
  type ToggleCategoryInput,
} from "@/features/catalog/categories/schema/category-schema"
import {
  createsCycle,
  reorderSiblings,
  type CategoryRow,
} from "@/features/shared/lib/catalog/category-tree"
import { CATEGORIES_CACHE_TAG } from "@/features/shared/lib/catalog/category-cache"
import { writeAudit } from "@/features/shared/lib/db/audit"
import { requirePermission } from "@/features/shared/lib/db/permissions"
import { prisma } from "@/features/shared/lib/db/prisma"
import {
  AppError,
  toActionError,
  type ActionResult,
} from "@/features/shared/lib/errors/action-result"
import { slugify } from "@/features/shared/lib/text/slug"

const categorySelect = {
  id: true,
  parentId: true,
  name: true,
  slug: true,
  position: true,
  active: true,
} as const

/**
 * Lists every category, active or not, for the back office.
 *
 * @returns `{ success: true, categories }` or `{ success: false, error }`.
 */
export async function listAdminCategories(): Promise<
  ActionResult<{ categories: CategoryRow[] }>
> {
  try {
    await requirePermission("category:manage")
    const categories = await prisma.category.findMany({
      select: categorySelect,
      orderBy: [{ position: "asc" }, { name: "asc" }],
    })
    return { success: true, categories }
  } catch (error) {
    return toActionError(error, { action: "listAdminCategories" })
  }
}

/**
 * Creates or edits a category (RF01). The slug comes from the name when
 * empty; a category cannot be placed inside its own subtree.
 *
 * @param input - Category form values.
 * @returns `{ success: true, id }` or `{ success: false, error }`.
 */
export async function saveCategory(
  input: CategoryFormInput
): Promise<ActionResult<{ id: string }>> {
  try {
    const parsed = categoryFormSchema.safeParse(input)
    if (!parsed.success) {
      throw new AppError("Revise os dados da categoria.", "invalid")
    }
    const { user } = await requirePermission("category:manage")
    const data = parsed.data
    const slug = data.slug || slugify(data.name)
    const parentId = data.parentId || null

    const saved = await prisma.$transaction(async (tx) => {
      const sameSlug = await tx.category.findUnique({ where: { slug } })
      if (sameSlug && sameSlug.id !== data.id) {
        throw new AppError("Já existe uma categoria com esse endereço.", "slug")
      }
      if (data.id) {
        const all = await tx.category.findMany({
          select: { id: true, parentId: true },
        })
        if (createsCycle(all, data.id, parentId)) {
          throw new AppError(
            "Uma categoria não pode ficar dentro dela mesma.",
            "cycle"
          )
        }
        const before = await tx.category.findUniqueOrThrow({
          where: { id: data.id },
          select: categorySelect,
        })
        const after = await tx.category.update({
          where: { id: data.id },
          data: { name: data.name, slug, parentId, active: data.active },
          select: categorySelect,
        })
        await writeAudit(tx, {
          userId: user.id,
          action: "category.update",
          entity: "category",
          entityId: after.id,
          before,
          after,
        })
        return after
      }
      const position = await tx.category.count({ where: { parentId } })
      const created = await tx.category.create({
        data: {
          name: data.name,
          slug,
          parentId,
          active: data.active,
          position,
        },
        select: categorySelect,
      })
      await writeAudit(tx, {
        userId: user.id,
        action: "category.create",
        entity: "category",
        entityId: created.id,
        after: created,
      })
      return created
    })

    revalidateTag(CATEGORIES_CACHE_TAG, "max")
    return { success: true, id: saved.id }
  } catch (error) {
    return toActionError(error, { action: "saveCategory" })
  }
}

/**
 * Moves a category one position up or down among its siblings, which
 * changes the order in the store menu without code changes (RF01).
 *
 * @param input - Category id and direction.
 * @returns `{ success: true }` or `{ success: false, error }`.
 */
export async function moveCategory(
  input: MoveCategoryInput
): Promise<ActionResult> {
  try {
    const parsed = moveCategorySchema.safeParse(input)
    if (!parsed.success) throw new AppError("Categoria inválida.", "invalid")
    const { user } = await requirePermission("category:manage")

    await prisma.$transaction(async (tx) => {
      const category = await tx.category.findUniqueOrThrow({
        where: { id: parsed.data.id },
        select: { parentId: true },
      })
      const siblings = await tx.category.findMany({
        where: { parentId: category.parentId },
        select: { id: true, position: true, name: true },
      })
      const positions = reorderSiblings(
        siblings,
        parsed.data.id,
        parsed.data.direction
      )
      if (!positions) return
      for (const { id, position } of positions) {
        await tx.category.update({ where: { id }, data: { position } })
      }
      await writeAudit(tx, {
        userId: user.id,
        action: "category.reorder",
        entity: "category",
        entityId: parsed.data.id,
        after: positions,
      })
    })

    revalidateTag(CATEGORIES_CACHE_TAG, "max")
    return { success: true }
  } catch (error) {
    return toActionError(error, { action: "moveCategory" })
  }
}

/**
 * Shows or hides a category in the store. Categories are never
 * deleted, so products and old orders keep their references.
 *
 * @param input - Category id and the new state.
 * @returns `{ success: true }` or `{ success: false, error }`.
 */
export async function toggleCategory(
  input: ToggleCategoryInput
): Promise<ActionResult> {
  try {
    const parsed = toggleCategorySchema.safeParse(input)
    if (!parsed.success) throw new AppError("Categoria inválida.", "invalid")
    const { user } = await requirePermission("category:manage")

    await prisma.$transaction(async (tx) => {
      const after = await tx.category.update({
        where: { id: parsed.data.id },
        data: { active: parsed.data.active },
        select: categorySelect,
      })
      await writeAudit(tx, {
        userId: user.id,
        action: parsed.data.active
          ? "category.activate"
          : "category.deactivate",
        entity: "category",
        entityId: after.id,
        after,
      })
    })

    revalidateTag(CATEGORIES_CACHE_TAG, "max")
    return { success: true }
  } catch (error) {
    return toActionError(error, { action: "toggleCategory" })
  }
}
