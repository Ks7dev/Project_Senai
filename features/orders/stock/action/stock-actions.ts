"use server"

import { revalidateTag } from "next/cache"
import { PRODUCTS_CACHE_TAG } from "@/features/shared/lib/catalog/product-cache"
import { writeAudit } from "@/features/shared/lib/db/audit"
import { requirePermission } from "@/features/shared/lib/db/permissions"
import { prisma } from "@/features/shared/lib/db/prisma"
import {
  AppError,
  toActionError,
  type ActionResult,
} from "@/features/shared/lib/errors/action-result"
import { expireUnpaidOrders } from "@/features/shared/lib/orders/order-expiration"
import { availableQuantity } from "@/features/shared/lib/stock/stock-math"
import { restockSku } from "@/features/shared/lib/stock/stock-service"
import {
  restockSchema,
  stockFiltersSchema,
  type RestockInput,
  type StockFiltersInput,
} from "@/features/orders/stock/schema/stock-schema"

/** Movement labels shown in the back office. */
const MOVEMENT_LABEL = {
  RESERVE: "Reserva",
  RELEASE: "Liberação",
  WRITE_OFF: "Baixa",
  RESTOCK: "Reposição",
  ADJUSTMENT: "Ajuste",
} as const

/** A SKU line of the stock list. */
export type StockRow = {
  /** SKU id. */
  skuId: string
  /** SKU code. */
  code: string
  /** Product and variation name. */
  name: string
  /** Units physically in stock. */
  onHand: number
  /** Units held by open orders. */
  reserved: number
  /** Units that can still be sold (on hand minus reserved). */
  available: number
}

/** A recent stock movement. */
export type StockMovementRow = {
  /** Movement id. */
  id: string
  /** When it happened, ISO. */
  createdAt: string
  /** SKU code. */
  code: string
  /** Movement label, in Portuguese. */
  type: string
  /** Units. */
  quantity: number
  /** Order number, when the movement belongs to an order. */
  orderNumber: string | null
  /** Who did it, or "Sistema". */
  user: string
  /** Reason. */
  note: string | null
}

/**
 * Stock by SKU for the back office (RF43, RF44): on hand, reserved and
 * available, plus the latest movements (reservations, releases,
 * write-offs and restocks).
 *
 * @param input - Search text and the "only unavailable" filter.
 * @returns `{ success: true, rows, movements }` or `{ success: false, error }`.
 */
export async function listStock(
  input: StockFiltersInput = {}
): Promise<ActionResult<{ rows: StockRow[]; movements: StockMovementRow[] }>> {
  try {
    const parsed = stockFiltersSchema.safeParse(input)
    if (!parsed.success) throw new AppError("Filtro inválido.", "invalid")
    await requirePermission("stock:read")
    const { search, onlyUnavailable } = parsed.data

    const skus = await prisma.sku.findMany({
      where: {
        product: { deletedAt: null },
        ...(search
          ? {
              OR: [
                { code: { contains: search } },
                { name: { contains: search } },
                { product: { name: { contains: search } } },
              ],
            }
          : {}),
      },
      orderBy: [{ product: { name: "asc" } }, { code: "asc" }],
      take: 300,
      select: {
        id: true,
        code: true,
        name: true,
        product: { select: { name: true } },
        stock: { select: { onHand: true, reserved: true } },
      },
    })
    const rows = skus
      .map((sku): StockRow => ({
        skuId: sku.id,
        code: sku.code,
        name: `${sku.product.name} — ${sku.name}`,
        onHand: sku.stock?.onHand ?? 0,
        reserved: sku.stock?.reserved ?? 0,
        available: availableQuantity(sku.stock),
      }))
      .filter((row) => !onlyUnavailable || row.available === 0)

    const movements = await prisma.stockMovement.findMany({
      orderBy: { createdAt: "desc" },
      take: 50,
      select: {
        id: true,
        createdAt: true,
        type: true,
        quantity: true,
        note: true,
        sku: { select: { code: true } },
        order: { select: { number: true } },
        user: { select: { name: true } },
      },
    })
    return {
      success: true,
      rows,
      movements: movements.map((movement) => ({
        id: movement.id,
        createdAt: movement.createdAt.toISOString(),
        code: movement.sku.code,
        type: MOVEMENT_LABEL[movement.type],
        quantity: movement.quantity,
        orderNumber: movement.order?.number ?? null,
        user: movement.user?.name ?? "Sistema",
        note: movement.note,
      })),
    }
  } catch (error) {
    return toActionError(error, { action: "listStock" })
  }
}

/**
 * Manual restock (RF43): adds units on hand, records the `RESTOCK`
 * movement with the user and the reason and writes the audit log, all
 * in one transaction.
 *
 * @param input - SKU, units and reason.
 * @returns `{ success: true, available }` or `{ success: false, error }`.
 */
export async function restockSkuAction(
  input: RestockInput
): Promise<ActionResult<{ available: number }>> {
  try {
    const parsed = restockSchema.safeParse(input)
    if (!parsed.success) {
      throw new AppError(
        parsed.error.issues[0]?.message ?? "Revise a reposição.",
        "invalid"
      )
    }
    const { user } = await requirePermission("stock:update")
    const data = parsed.data

    const result = await prisma.$transaction(async (tx) => {
      const counters = await restockSku(tx, {
        skuId: data.skuId,
        quantity: data.quantity,
        userId: user.id,
        note: data.note,
      })
      await writeAudit(tx, {
        userId: user.id,
        action: "stock.restock",
        entity: "sku",
        entityId: data.skuId,
        before: counters.before,
        after: { ...counters.after, note: data.note },
      })
      return counters
    })

    revalidateTag(PRODUCTS_CACHE_TAG, "max")
    return { success: true, available: availableQuantity(result.after) }
  } catch (error) {
    return toActionError(error, { action: "restockSkuAction" })
  }
}

/**
 * Runs the expiration of unpaid Pix and boleto orders now (RN14),
 * without waiting for the background job: cancels them and releases
 * their reservations.
 *
 * @returns `{ success: true, canceled }` or `{ success: false, error }`.
 */
export async function releaseExpiredReservations(): Promise<
  ActionResult<{ canceled: number }>
> {
  try {
    await requirePermission("stock:update")
    const canceled = await expireUnpaidOrders()
    if (canceled.length > 0) revalidateTag(PRODUCTS_CACHE_TAG, "max")
    return { success: true, canceled: canceled.length }
  } catch (error) {
    return toActionError(error, { action: "releaseExpiredReservations" })
  }
}
