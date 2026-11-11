"use server"

import type { Prisma } from "@/generated/prisma/client"
import {
  regionFormSchema,
  toggleRegionSchema,
  type RegionFormInput,
  type ToggleRegionInput,
} from "@/features/shipping/regions/schema/region-schema"
import { writeAudit } from "@/features/shared/lib/db/audit"
import { requirePermission } from "@/features/shared/lib/db/permissions"
import { prisma } from "@/features/shared/lib/db/prisma"
import {
  AppError,
  toActionError,
  type ActionResult,
} from "@/features/shared/lib/errors/action-result"
import { ownDeliveryRatesSchema } from "@/features/shared/schema/shipping-schema"

/** A delivery region as shown and edited in the back office. */
export type RegionRow = {
  /** Region id. */
  id: string
  /** Region name. */
  name: string
  /** First CEP of the range, 8 digits. */
  cepStart: string
  /** Last CEP of the range, 8 digits. */
  cepEnd: string
  /** Own delivery and assembly inside this range (RN16). */
  ownDelivery: boolean
  /** Own delivery prices by maximum weight, ascending (RF50). */
  rates: Array<{ maxKg: string; price: string }>
  /** Regional free shipping minimum (RN23), empty when undefined. */
  freeShippingMinimum: string
  /** Whether the range is in use. */
  active: boolean
}

type RegionRecord = Prisma.ShippingRegionGetPayload<object>

/**
 * Maps a database row to the back office shape.
 *
 * @param row - Shipping region row.
 * @returns The region for the view.
 */
function toRow(row: RegionRecord): RegionRow {
  const rates = ownDeliveryRatesSchema.safeParse(row.ownDeliveryRates ?? [])
  return {
    id: row.id,
    name: row.name,
    cepStart: row.cepStart,
    cepEnd: row.cepEnd,
    ownDelivery: row.ownDelivery,
    rates: (rates.success ? rates.data : [])
      .sort((a, b) => a.maxKg - b.maxKg)
      .map((rate) => ({
        maxKg: String(rate.maxKg),
        price: Number(rate.price).toFixed(2),
      })),
    freeShippingMinimum: row.freeShippingMinimum?.toFixed(2) ?? "",
    active: row.active,
  }
}

/**
 * Refuses a CEP range that overlaps another active region, so each CEP
 * has a single coverage answer (RF27).
 *
 * @param tx - Prisma transaction.
 * @param range - Range being saved or activated.
 * @throws AppError naming the overlapping region.
 */
async function assertNoOverlap(
  tx: Prisma.TransactionClient,
  range: { id?: string; cepStart: string; cepEnd: string }
): Promise<void> {
  const overlap = await tx.shippingRegion.findFirst({
    where: {
      active: true,
      ...(range.id ? { id: { not: range.id } } : {}),
      cepStart: { lte: range.cepEnd },
      cepEnd: { gte: range.cepStart },
    },
    select: { name: true },
  })
  if (overlap) {
    throw new AppError(
      `A faixa de CEP se sobrepõe à região "${overlap.name}".`,
      "overlap"
    )
  }
}

/**
 * Lists every delivery region, active or not, ordered by CEP (RF50).
 *
 * @returns `{ success: true, regions }` or `{ success: false, error }`.
 */
export async function listShippingRegions(): Promise<
  ActionResult<{ regions: RegionRow[] }>
> {
  try {
    await requirePermission("setting:manage")
    const rows = await prisma.shippingRegion.findMany({
      orderBy: [{ cepStart: "asc" }],
    })
    return { success: true, regions: rows.map(toRow) }
  } catch (error) {
    return toActionError(error, { action: "listShippingRegions" })
  }
}

/**
 * Creates or edits a delivery region: CEP range, own delivery with
 * assembly, the price table by weight and the free shipping minimum
 * (RF50, RN16, RN23). Ranges of active regions never overlap.
 *
 * @param input - Region form values.
 * @returns `{ success: true, id }` or `{ success: false, error }`.
 */
export async function saveShippingRegion(
  input: RegionFormInput
): Promise<ActionResult<{ id: string }>> {
  try {
    const parsed = regionFormSchema.safeParse(input)
    if (!parsed.success) {
      throw new AppError(
        parsed.error.issues[0]?.message ?? "Revise os dados da região.",
        "invalid"
      )
    }
    const { user } = await requirePermission("setting:manage")
    const { id, rates, freeShippingMinimum, ...data } = parsed.data
    const fields = {
      ...data,
      ownDeliveryRates: [...rates]
        .sort((a, b) => a.maxKg - b.maxKg)
        .map((rate) => ({
          maxKg: rate.maxKg,
          price: Number(rate.price).toFixed(2),
        })),
      freeShippingMinimum: freeShippingMinimum || null,
    }

    const saved = await prisma.$transaction(async (tx) => {
      if (data.active) await assertNoOverlap(tx, { id, ...data })
      if (id) {
        const before = await tx.shippingRegion.findUnique({ where: { id } })
        if (!before) throw new AppError("Região não encontrada.", "not_found")
        const after = await tx.shippingRegion.update({
          where: { id },
          data: fields,
        })
        await writeAudit(tx, {
          userId: user.id,
          action: "shipping_region.update",
          entity: "shipping_region",
          entityId: id,
          before: toRow(before),
          after: toRow(after),
        })
        return after
      }
      const created = await tx.shippingRegion.create({ data: fields })
      await writeAudit(tx, {
        userId: user.id,
        action: "shipping_region.create",
        entity: "shipping_region",
        entityId: created.id,
        after: toRow(created),
      })
      return created
    })
    return { success: true, id: saved.id }
  } catch (error) {
    return toActionError(error, { action: "saveShippingRegion" })
  }
}

/**
 * Activates or deactivates a region. Regions are not deleted, so the
 * audit history keeps its references.
 *
 * @param input - Region id and the new state.
 * @returns `{ success: true }` or `{ success: false, error }`.
 */
export async function toggleShippingRegion(
  input: ToggleRegionInput
): Promise<ActionResult> {
  try {
    const parsed = toggleRegionSchema.safeParse(input)
    if (!parsed.success) throw new AppError("Região inválida.", "invalid")
    const { user } = await requirePermission("setting:manage")
    const { id, active } = parsed.data

    await prisma.$transaction(async (tx) => {
      const region = await tx.shippingRegion.findUnique({ where: { id } })
      if (!region) throw new AppError("Região não encontrada.", "not_found")
      if (active) await assertNoOverlap(tx, region)
      await tx.shippingRegion.update({ where: { id }, data: { active } })
      await writeAudit(tx, {
        userId: user.id,
        action: active
          ? "shipping_region.activate"
          : "shipping_region.deactivate",
        entity: "shipping_region",
        entityId: id,
        after: { active },
      })
    })
    return { success: true }
  } catch (error) {
    return toActionError(error, { action: "toggleShippingRegion" })
  }
}
