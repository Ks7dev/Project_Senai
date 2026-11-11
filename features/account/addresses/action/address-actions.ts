"use server"

import {
  addressIdSchema,
  addressSchema,
  type AddressData,
  type AddressIdInput,
  type AddressInput,
} from "@/features/account/addresses/schema/address-schema"
import { hasCorporatePermission } from "@/features/shared/lib/auth/corporate-roles"
import { getCurrentUser } from "@/features/shared/lib/auth/session"
import { writeAudit } from "@/features/shared/lib/db/audit"
import { getCorporateContext } from "@/features/shared/lib/db/corporate"
import {
  FORBIDDEN_MESSAGE,
  UNAUTHENTICATED_MESSAGE,
} from "@/features/shared/lib/db/permissions"
import { prisma } from "@/features/shared/lib/db/prisma"
import {
  AppError,
  toActionError,
  type ActionResult,
} from "@/features/shared/lib/errors/action-result"

/** Saved address shown in the list. */
export type SavedAddress = AddressData & { id: string }

/** Who owns the addresses: the company (PJ) or the customer (PF). */
type Owner =
  | { userId: string; organizationId?: undefined; canManage: boolean }
  | { organizationId: string; userId?: undefined; canManage: boolean }

/**
 * Resolves the address owner from the session (RF26): corporate
 * addresses belong to the company and only account administrators edit
 * them; PF customers own their addresses.
 *
 * @returns Owner, the acting user id and whether they may edit.
 */
async function resolveOwner(): Promise<{ owner: Owner; userId: string }> {
  const user = await getCurrentUser()
  if (!user) throw new AppError(UNAUTHENTICATED_MESSAGE, "unauthenticated")
  const corporate = await getCorporateContext()
  if (corporate) {
    return {
      userId: user.id,
      owner: {
        organizationId: corporate.organizationId,
        canManage: hasCorporatePermission(corporate.roles, "address:manage"),
      },
    }
  }
  return { userId: user.id, owner: { userId: user.id, canManage: true } }
}

/**
 * Prisma filter of the owner's active addresses.
 *
 * @param owner - Address owner.
 * @returns The where clause.
 */
function ownerWhere(owner: Owner) {
  return owner.organizationId
    ? { organizationId: owner.organizationId, deletedAt: null }
    : { userId: owner.userId, deletedAt: null }
}

/**
 * Lists the delivery addresses of the account, default first.
 *
 * @returns `{ success: true, addresses, canManage }` or an error.
 */
export async function listAddresses(): Promise<
  ActionResult<{ addresses: SavedAddress[]; canManage: boolean }>
> {
  try {
    const { owner } = await resolveOwner()
    const rows = await prisma.address.findMany({
      where: ownerWhere(owner),
      orderBy: [{ isDefault: "desc" }, { label: "asc" }],
    })
    return {
      success: true,
      canManage: owner.canManage,
      addresses: rows.map((row) => ({
        id: row.id,
        label: row.label,
        recipient: row.recipient,
        cep: row.cep,
        street: row.street,
        number: row.number,
        complement: row.complement ?? "",
        district: row.district,
        city: row.city,
        state: row.state as AddressData["state"],
        isDefault: row.isDefault,
      })),
    }
  } catch (error) {
    return toActionError(error, { action: "listAddresses" })
  }
}

/**
 * Creates or edits an address (RF26). The first address becomes the
 * default; marking one as default unmarks the others.
 *
 * @param input - Address form values.
 * @returns `{ success: true, id }` or `{ success: false, error }`.
 */
export async function saveAddress(
  input: AddressInput
): Promise<ActionResult<{ id: string }>> {
  try {
    const parsed = addressSchema.safeParse(input)
    if (!parsed.success) {
      throw new AppError("Revise os dados do endereço.", "invalid")
    }
    const { owner, userId } = await resolveOwner()
    if (!owner.canManage) throw new AppError(FORBIDDEN_MESSAGE, "forbidden")
    const { id, isDefault, ...data } = parsed.data
    const where = ownerWhere(owner)

    const saved = await prisma.$transaction(async (tx) => {
      if (id) {
        const current = await tx.address.findFirst({ where: { ...where, id } })
        if (!current)
          throw new AppError("Endereço não encontrado.", "not_found")
      }
      const count = await tx.address.count({ where })
      const makeDefault =
        isDefault || count === 0 || (id !== undefined && count === 1)
      if (makeDefault) {
        await tx.address.updateMany({ where, data: { isDefault: false } })
      }
      const fields = {
        ...data,
        complement: data.complement || null,
        ...(makeDefault ? { isDefault: true } : {}),
      }
      const address = id
        ? await tx.address.update({ where: { id }, data: fields })
        : await tx.address.create({
            data: {
              ...fields,
              isDefault: makeDefault,
              userId: owner.userId ?? null,
              organizationId: owner.organizationId ?? null,
            },
          })
      await writeAudit(tx, {
        userId,
        action: id ? "address.update" : "address.create",
        entity: "address",
        entityId: address.id,
        after: { label: address.label, isDefault: address.isDefault },
      })
      return address
    })
    return { success: true, id: saved.id }
  } catch (error) {
    return toActionError(error, { action: "saveAddress" })
  }
}

/**
 * Marks an address as the default delivery address.
 *
 * @param input - Address id.
 * @returns `{ success: true }` or `{ success: false, error }`.
 */
export async function setDefaultAddress(
  input: AddressIdInput
): Promise<ActionResult> {
  try {
    const { id } = addressIdSchema.parse(input)
    const { owner } = await resolveOwner()
    if (!owner.canManage) throw new AppError(FORBIDDEN_MESSAGE, "forbidden")
    const where = ownerWhere(owner)
    await prisma.$transaction(async (tx) => {
      const target = await tx.address.findFirst({ where: { ...where, id } })
      if (!target) throw new AppError("Endereço não encontrado.", "not_found")
      await tx.address.updateMany({ where, data: { isDefault: false } })
      await tx.address.update({ where: { id }, data: { isDefault: true } })
    })
    return { success: true }
  } catch (error) {
    return toActionError(error, { action: "setDefaultAddress" })
  }
}

/**
 * Removes an address (soft delete, so orders keep their snapshot). If
 * it was the default, the next address becomes the default.
 *
 * @param input - Address id.
 * @returns `{ success: true }` or `{ success: false, error }`.
 */
export async function deleteAddress(
  input: AddressIdInput
): Promise<ActionResult> {
  try {
    const { id } = addressIdSchema.parse(input)
    const { owner, userId } = await resolveOwner()
    if (!owner.canManage) throw new AppError(FORBIDDEN_MESSAGE, "forbidden")
    const where = ownerWhere(owner)
    await prisma.$transaction(async (tx) => {
      const target = await tx.address.findFirst({ where: { ...where, id } })
      if (!target) throw new AppError("Endereço não encontrado.", "not_found")
      await tx.address.update({
        where: { id },
        data: { deletedAt: new Date(), isDefault: false },
      })
      if (target.isDefault) {
        const next = await tx.address.findFirst({
          where,
          orderBy: { createdAt: "asc" },
        })
        if (next) {
          await tx.address.update({
            where: { id: next.id },
            data: { isDefault: true },
          })
        }
      }
      await writeAudit(tx, {
        userId,
        action: "address.delete",
        entity: "address",
        entityId: id,
        before: { label: target.label },
      })
    })
    return { success: true }
  } catch (error) {
    return toActionError(error, { action: "deleteAddress" })
  }
}
