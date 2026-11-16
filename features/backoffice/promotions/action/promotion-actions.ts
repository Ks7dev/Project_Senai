"use server"

import type { Prisma } from "@/generated/prisma/client"
import {
  deletePromotionSchema,
  promotionFormSchema,
  togglePromotionSchema,
  type DeletePromotionInput,
  type PromotionFormInput,
  type TogglePromotionInput,
} from "@/features/backoffice/promotions/schema/promotion-schema"
import { writeAudit } from "@/features/shared/lib/db/audit"
import { requirePermission } from "@/features/shared/lib/db/permissions"
import { prisma } from "@/features/shared/lib/db/prisma"
import {
  AppError,
  toActionError,
  type ActionResult,
} from "@/features/shared/lib/errors/action-result"
import { isPromotionActive } from "@/features/shared/lib/promotions/promotion-math"

/** Where a promotion stands now. */
export type PromotionState = "running" | "scheduled" | "ended" | "inactive"

/** A promotion as the back office lists and edits it. */
export type PromotionRow = {
  /** Promotion id. */
  id: string
  /** Name. */
  name: string
  /** Product, category or coupon. */
  scope: "PRODUCT" | "CATEGORY" | "COUPON"
  /** Product id, or empty. */
  productId: string
  /** Product name, or null. */
  productName: string | null
  /** Category id, or empty. */
  categoryId: string
  /** Category name, or null. */
  categoryName: string | null
  /** Coupon code, or empty. */
  couponCode: string
  /** Percent or fixed. */
  discountType: "PERCENT" | "FIXED"
  /** Discount value, decimal string. */
  discountValue: string
  /** Courtesy shipping (RN23). */
  freeShipping: boolean
  /** Minimum order total, decimal string or empty. */
  minOrderTotal: string
  /** Start of the validity, ISO string. */
  startsAt: string
  /** End of the validity, ISO string. */
  endsAt: string
  /** Turned on. */
  active: boolean
  /** Where it stands now. */
  state: PromotionState
}

/** An option of the product or category select. */
export type PromotionTarget = {
  /** Id. */
  id: string
  /** Name shown in the select. */
  name: string
}

const promotionInclude = {
  product: { select: { name: true } },
  category: { select: { name: true } },
} satisfies Prisma.PromotionInclude

type PromotionRecord = Prisma.PromotionGetPayload<{
  include: typeof promotionInclude
}>

/**
 * Where a promotion stands at a moment.
 *
 * @param row - Promotion validity and flag.
 * @param now - Moment.
 * @returns The state.
 */
function stateOf(
  row: { active: boolean; startsAt: Date; endsAt: Date },
  now: Date
): PromotionState {
  if (!row.active) return "inactive"
  if (isPromotionActive(row, now)) return "running"
  return row.startsAt.getTime() > now.getTime() ? "scheduled" : "ended"
}

/**
 * Maps a database row to the back office shape.
 *
 * @param row - Promotion with product and category names.
 * @param now - Moment, for the state.
 * @returns The row.
 */
function toRow(row: PromotionRecord, now: Date): PromotionRow {
  return {
    id: row.id,
    name: row.name,
    scope: row.scope,
    productId: row.productId ?? "",
    productName: row.product?.name ?? null,
    categoryId: row.categoryId ?? "",
    categoryName: row.category?.name ?? null,
    couponCode: row.couponCode ?? "",
    discountType: row.discountType,
    discountValue: row.discountValue.toFixed(2),
    freeShipping: row.freeShipping,
    minOrderTotal: row.minOrderTotal?.toFixed(2) ?? "",
    startsAt: row.startsAt.toISOString(),
    endsAt: row.endsAt.toISOString(),
    active: row.active,
    state: stateOf(row, now),
  }
}

/**
 * Values recorded in the audit log for a promotion.
 *
 * @param row - Promotion row.
 * @returns Plain values.
 */
function auditValues(row: Prisma.PromotionGetPayload<object>) {
  return {
    name: row.name,
    scope: row.scope,
    productId: row.productId,
    categoryId: row.categoryId,
    couponCode: row.couponCode,
    discountType: row.discountType,
    discountValue: row.discountValue.toFixed(2),
    freeShipping: row.freeShipping,
    minOrderTotal: row.minOrderTotal?.toFixed(2) ?? null,
    startsAt: row.startsAt.toISOString(),
    endsAt: row.endsAt.toISOString(),
    active: row.active,
  }
}

/**
 * Lists the promotions (not deleted) with the products and categories
 * that may receive one (RF46).
 *
 * @returns `{ success: true, promotions, products, categories }` or
 *   `{ success: false, error }`.
 */
export async function listPromotions(): Promise<
  ActionResult<{
    promotions: PromotionRow[]
    products: PromotionTarget[]
    categories: PromotionTarget[]
  }>
> {
  try {
    await requirePermission("promotion:manage")
    const now = new Date()
    const [rows, products, categories] = await Promise.all([
      prisma.promotion.findMany({
        where: { deletedAt: null },
        include: promotionInclude,
        orderBy: [{ startsAt: "desc" }],
      }),
      prisma.product.findMany({
        where: { deletedAt: null },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      }),
      prisma.category.findMany({
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      }),
    ])
    return {
      success: true,
      promotions: rows.map((row) => toRow(row, now)),
      products,
      categories,
    }
  } catch (error) {
    return toActionError(error, { action: "listPromotions" })
  }
}

/**
 * Whether the error is the unique coupon code conflict.
 *
 * @param error - Caught error.
 * @returns True on a duplicate coupon code.
 */
function isDuplicateCoupon(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "P2002"
  )
}

/**
 * Creates or edits a promotion (RF46, RN23): product, category or
 * coupon, percent or fixed discount, courtesy shipping, minimum order
 * and validity. Every change is audited (RNF12).
 *
 * @param input - Promotion form values.
 * @returns `{ success: true, id }` or `{ success: false, error }`.
 */
export async function savePromotion(
  input: PromotionFormInput
): Promise<ActionResult<{ id: string }>> {
  try {
    const parsed = promotionFormSchema.safeParse(input)
    if (!parsed.success) {
      throw new AppError(
        parsed.error.issues[0]?.message ?? "Revise os dados da promoção.",
        "invalid"
      )
    }
    const { user } = await requirePermission("promotion:manage")
    const { id, ...data } = parsed.data
    const fields = {
      name: data.name,
      scope: data.scope,
      productId: data.scope === "PRODUCT" ? data.productId || null : null,
      categoryId: data.scope === "CATEGORY" ? data.categoryId || null : null,
      couponCode: data.scope === "COUPON" ? data.couponCode || null : null,
      discountType: data.discountType,
      discountValue: data.discountValue,
      freeShipping: data.freeShipping,
      minOrderTotal: data.minOrderTotal || null,
      startsAt: data.startsAt,
      endsAt: data.endsAt,
      active: data.active,
    }

    const saved = await prisma.$transaction(async (tx) => {
      if (fields.productId) {
        const product = await tx.product.findFirst({
          where: { id: fields.productId, deletedAt: null },
          select: { id: true },
        })
        if (!product) {
          throw new AppError("Produto não encontrado.", "not_found")
        }
      }
      if (fields.categoryId) {
        const category = await tx.category.findUnique({
          where: { id: fields.categoryId },
          select: { id: true },
        })
        if (!category) {
          throw new AppError("Categoria não encontrada.", "not_found")
        }
      }
      if (id) {
        const before = await tx.promotion.findFirst({
          where: { id, deletedAt: null },
        })
        if (!before) throw new AppError("Promoção não encontrada.", "not_found")
        const after = await tx.promotion.update({ where: { id }, data: fields })
        await writeAudit(tx, {
          userId: user.id,
          action: "promotion.update",
          entity: "promotion",
          entityId: id,
          before: auditValues(before),
          after: auditValues(after),
        })
        return after
      }
      const created = await tx.promotion.create({ data: fields })
      await writeAudit(tx, {
        userId: user.id,
        action: "promotion.create",
        entity: "promotion",
        entityId: created.id,
        after: auditValues(created),
      })
      return created
    })
    return { success: true, id: saved.id }
  } catch (error) {
    if (isDuplicateCoupon(error)) {
      return toActionError(
        new AppError("Já existe um cupom com este código.", "duplicate"),
        { action: "savePromotion" }
      )
    }
    return toActionError(error, { action: "savePromotion" })
  }
}

/**
 * Turns a promotion on or off. Off, it never applies, even inside the
 * validity.
 *
 * @param input - Promotion id and the new state.
 * @returns `{ success: true }` or `{ success: false, error }`.
 */
export async function togglePromotion(
  input: TogglePromotionInput
): Promise<ActionResult> {
  try {
    const parsed = togglePromotionSchema.safeParse(input)
    if (!parsed.success) throw new AppError("Promoção inválida.", "invalid")
    const { user } = await requirePermission("promotion:manage")
    const { id, active } = parsed.data
    await prisma.$transaction(async (tx) => {
      const before = await tx.promotion.findFirst({
        where: { id, deletedAt: null },
        select: { active: true },
      })
      if (!before) throw new AppError("Promoção não encontrada.", "not_found")
      await tx.promotion.update({ where: { id }, data: { active } })
      await writeAudit(tx, {
        userId: user.id,
        action: active ? "promotion.activate" : "promotion.deactivate",
        entity: "promotion",
        entityId: id,
        before: { active: before.active },
        after: { active },
      })
    })
    return { success: true }
  } catch (error) {
    return toActionError(error, { action: "togglePromotion" })
  }
}

/**
 * Removes a promotion (soft delete): it stops applying and leaves the
 * list, but orders and the audit log keep their references.
 *
 * @param input - Promotion id.
 * @returns `{ success: true }` or `{ success: false, error }`.
 */
export async function deletePromotion(
  input: DeletePromotionInput
): Promise<ActionResult> {
  try {
    const parsed = deletePromotionSchema.safeParse(input)
    if (!parsed.success) throw new AppError("Promoção inválida.", "invalid")
    const { user } = await requirePermission("promotion:manage")
    const { id } = parsed.data
    await prisma.$transaction(async (tx) => {
      const before = await tx.promotion.findFirst({
        where: { id, deletedAt: null },
      })
      if (!before) throw new AppError("Promoção não encontrada.", "not_found")
      await tx.promotion.update({
        where: { id },
        // The code is freed so a new coupon may reuse it
        data: { deletedAt: new Date(), active: false, couponCode: null },
      })
      await writeAudit(tx, {
        userId: user.id,
        action: "promotion.delete",
        entity: "promotion",
        entityId: id,
        before: auditValues(before),
      })
    })
    return { success: true }
  } catch (error) {
    return toActionError(error, { action: "deletePromotion" })
  }
}
