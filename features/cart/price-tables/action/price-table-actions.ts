"use server"

import type { Prisma } from "@/generated/prisma/client"
import {
  assignCustomerTableSchema,
  assignOrganizationTableSchema,
  pricingIdSchema,
  priceTableFormSchema,
  volumeDiscountFormSchema,
  type AssignCustomerTableInput,
  type AssignOrganizationTableInput,
  type PricingIdInput,
  type PriceTableFormInput,
  type VolumeDiscountFormInput,
} from "@/features/cart/price-tables/schema/price-table-schema"
import { writeAudit } from "@/features/shared/lib/db/audit"
import { requirePermission } from "@/features/shared/lib/db/permissions"
import { prisma } from "@/features/shared/lib/db/prisma"
import {
  AppError,
  toActionError,
  type ActionResult,
} from "@/features/shared/lib/errors/action-result"

/** A product discount of a price table, as the back office edits it. */
export type PriceTableItemRow = {
  /** Product id. */
  productId: string
  /** Product name. */
  productName: string
  /** Discount in percent, decimal string. */
  discountPercent: string
}

/** A price table as the back office shows it (RF21). */
export type PriceTableRow = {
  /** Table id. */
  id: string
  /** Name, e.g. "Corporativo". */
  name: string
  /** Description, empty when none. */
  description: string
  /** Default discount in percent, decimal string. */
  discountPercent: string
  /** Whether the table is in use. */
  active: boolean
  /** Discounts per product. */
  items: PriceTableItemRow[]
  /** Corporate accounts and PF customers using the table. */
  customerCount: number
}

/** A corporate account and its price table. */
export type OrganizationPricingRow = {
  /** Account id. */
  id: string
  /** Account name. */
  name: string
  /** CNPJ, digits only, or null. */
  cnpj: string | null
  /** Price table id, or null. */
  priceTableId: string | null
}

/** A PF customer with a price table. */
export type CustomerPricingRow = {
  /** User id. */
  id: string
  /** Customer name. */
  name: string
  /** Login e-mail. */
  email: string
  /** Price table id. */
  priceTableId: string
}

/** A volume discount rule as the back office shows it (RN04). */
export type VolumeDiscountRow = {
  /** Rule id. */
  id: string
  /** Category id. */
  categoryId: string
  /** Category name. */
  categoryName: string
  /** Minimum units, empty when none. */
  minQuantity: string
  /** Minimum amount, decimal string, empty when none. */
  minAmount: string
  /** Discount in percent, decimal string. */
  discountPercent: string
  /** Whether the rule is in use. */
  active: boolean
}

/** Everything the pricing back office shows. */
export type PricingAdminData = {
  /** Price tables not removed, by name. */
  tables: PriceTableRow[]
  /** Products that may get a table discount, by name. */
  products: Array<{ id: string; name: string }>
  /** Corporate accounts, by name. */
  organizations: OrganizationPricingRow[]
  /** PF customers with a table, by name. */
  customers: CustomerPricingRow[]
  /** Categories for the volume rules, by name. */
  categories: Array<{ id: string; name: string }>
  /** Volume discount rules not removed. */
  volumeDiscounts: VolumeDiscountRow[]
}

/** Message when a table was removed or never existed. */
const TABLE_NOT_FOUND = "Tabela de preços não encontrada."

/** Message when a volume rule was removed or never existed. */
const RULE_NOT_FOUND = "Desconto por volume não encontrado."

const tableInclude = {
  items: {
    select: {
      productId: true,
      discountPercent: true,
      product: { select: { name: true } },
    },
    orderBy: { product: { name: "asc" } },
  },
  _count: { select: { organizations: true, users: true } },
} satisfies Prisma.PriceTableInclude

type TableRecord = Prisma.PriceTableGetPayload<{
  include: typeof tableInclude
}>

/**
 * Maps a price table row to the back office shape.
 *
 * @param row - Price table with items and counts.
 * @returns The table for the view and the audit log.
 */
function toTableRow(row: TableRecord): PriceTableRow {
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? "",
    discountPercent: row.discountPercent.toFixed(2),
    active: row.active,
    items: row.items.map((item) => ({
      productId: item.productId,
      productName: item.product.name,
      discountPercent: item.discountPercent.toFixed(2),
    })),
    customerCount: row._count.organizations + row._count.users,
  }
}

type VolumeRecord = Prisma.VolumeDiscountGetPayload<{
  include: { category: { select: { name: true } } }
}>

/**
 * Maps a volume rule row to the back office shape.
 *
 * @param row - Volume rule with its category name.
 * @returns The rule for the view and the audit log.
 */
function toVolumeRow(row: VolumeRecord): VolumeDiscountRow {
  return {
    id: row.id,
    categoryId: row.categoryId,
    categoryName: row.category.name,
    minQuantity: row.minQuantity === null ? "" : String(row.minQuantity),
    minAmount: row.minAmount?.toFixed(2) ?? "",
    discountPercent: row.discountPercent.toFixed(2),
    active: row.active,
  }
}

/**
 * Loads a price table that was not removed.
 *
 * @param tx - Prisma transaction.
 * @param id - Table id.
 * @returns The table.
 * @throws AppError("not_found").
 */
async function findTable(
  tx: Prisma.TransactionClient,
  id: string
): Promise<TableRecord> {
  const table = await tx.priceTable.findFirst({
    where: { id, deletedAt: null },
    include: tableInclude,
  })
  if (!table) throw new AppError(TABLE_NOT_FOUND, "not_found")
  return table
}

/**
 * Refuses a name already used by another table, so the customer never
 * sees two tables with the same name.
 *
 * @param tx - Prisma transaction.
 * @param name - Table name.
 * @param id - Id of the table being edited, if any.
 * @throws AppError("duplicate").
 */
async function assertUniqueName(
  tx: Prisma.TransactionClient,
  name: string,
  id?: string
): Promise<void> {
  const other = await tx.priceTable.findFirst({
    where: { name, deletedAt: null, ...(id ? { id: { not: id } } : {}) },
    select: { id: true },
  })
  if (other) {
    throw new AppError("Já existe uma tabela com este nome.", "duplicate")
  }
}

/**
 * Loads the pricing back office: price tables with their product
 * discounts, the corporate accounts and PF customers with their tables
 * (RF21) and the volume discount rules by category (RN04).
 *
 * @returns `{ success: true, data }` or `{ success: false, error }`.
 */
export async function getPricingAdmin(): Promise<
  ActionResult<{ data: PricingAdminData }>
> {
  try {
    await requirePermission("customer:update")
    const [tables, products, organizations, customers, categories, rules] =
      await Promise.all([
        prisma.priceTable.findMany({
          where: { deletedAt: null },
          include: tableInclude,
          orderBy: { name: "asc" },
        }),
        prisma.product.findMany({
          where: { deletedAt: null, status: { not: "INACTIVE" } },
          select: { id: true, name: true },
          orderBy: { name: "asc" },
        }),
        prisma.organization.findMany({
          where: { deletedAt: null },
          select: { id: true, name: true, cnpj: true, priceTableId: true },
          orderBy: { name: "asc" },
        }),
        prisma.user.findMany({
          where: {
            deletedAt: null,
            personType: "PF",
            priceTable: { deletedAt: null },
          },
          select: { id: true, name: true, email: true, priceTableId: true },
          orderBy: { name: "asc" },
        }),
        prisma.category.findMany({
          select: { id: true, name: true },
          orderBy: { name: "asc" },
        }),
        prisma.volumeDiscount.findMany({
          where: { deletedAt: null },
          include: { category: { select: { name: true } } },
          orderBy: [{ category: { name: "asc" } }, { discountPercent: "asc" }],
        }),
      ])
    return {
      success: true,
      data: {
        tables: tables.map(toTableRow),
        products,
        organizations,
        customers: customers.flatMap((customer) =>
          customer.priceTableId
            ? [{ ...customer, priceTableId: customer.priceTableId }]
            : []
        ),
        categories,
        volumeDiscounts: rules.map(toVolumeRow),
      },
    }
  } catch (error) {
    return toActionError(error, { action: "getPricingAdmin" })
  }
}

/**
 * Creates or edits a price table (RF21): name, default discount over
 * the catalog price and the discounts per product, which replace the
 * previous ones. The change is a price change and is audited with the
 * values before and after (RNF12).
 *
 * @param input - Table form values.
 * @returns `{ success: true, id }` or `{ success: false, error }`.
 */
export async function savePriceTable(
  input: PriceTableFormInput
): Promise<ActionResult<{ id: string }>> {
  try {
    const parsed = priceTableFormSchema.safeParse(input)
    if (!parsed.success) {
      throw new AppError(
        parsed.error.issues[0]?.message ?? "Revise os dados da tabela.",
        "invalid"
      )
    }
    const { user } = await requirePermission("customer:update")
    const { id, items, description, ...data } = parsed.data
    const fields = { ...data, description: description || null }

    const savedId = await prisma.$transaction(async (tx) => {
      await assertUniqueName(tx, data.name, id)
      const productIds = items.map((item) => item.productId)
      const found = await tx.product.count({
        where: { id: { in: productIds }, deletedAt: null },
      })
      if (found !== productIds.length) {
        throw new AppError(
          "Há produtos que não existem mais no catálogo.",
          "invalid_product"
        )
      }
      const before = id ? toTableRow(await findTable(tx, id)) : undefined
      const table = id
        ? await tx.priceTable.update({ where: { id }, data: fields })
        : await tx.priceTable.create({ data: fields })
      await tx.priceTableItem.deleteMany({ where: { priceTableId: table.id } })
      if (items.length > 0) {
        await tx.priceTableItem.createMany({
          data: items.map((item) => ({
            priceTableId: table.id,
            productId: item.productId,
            discountPercent: item.discountPercent,
          })),
        })
      }
      await writeAudit(tx, {
        userId: user.id,
        action: id ? "price_table.update" : "price_table.create",
        entity: "price_table",
        entityId: table.id,
        before,
        after: toTableRow(await findTable(tx, table.id)),
      })
      return table.id
    })
    return { success: true, id: savedId }
  } catch (error) {
    return toActionError(error, { action: "savePriceTable" })
  }
}

/**
 * Removes a price table (soft delete). Its customers go back to the
 * catalog price, and the removal is audited (RNF12).
 *
 * @param input - Table id.
 * @returns `{ success: true }` or `{ success: false, error }`.
 */
export async function removePriceTable(
  input: PricingIdInput
): Promise<ActionResult> {
  try {
    const parsed = pricingIdSchema.safeParse(input)
    if (!parsed.success) throw new AppError(TABLE_NOT_FOUND, "invalid")
    const { user } = await requirePermission("customer:update")
    const { id } = parsed.data

    await prisma.$transaction(async (tx) => {
      const before = toTableRow(await findTable(tx, id))
      await tx.organization.updateMany({
        where: { priceTableId: id },
        data: { priceTableId: null },
      })
      await tx.user.updateMany({
        where: { priceTableId: id },
        data: { priceTableId: null },
      })
      await tx.priceTable.update({
        where: { id },
        data: { active: false, deletedAt: new Date() },
      })
      await writeAudit(tx, {
        userId: user.id,
        action: "price_table.delete",
        entity: "price_table",
        entityId: id,
        before,
      })
    })
    return { success: true }
  } catch (error) {
    return toActionError(error, { action: "removePriceTable" })
  }
}

/**
 * Checks that a table chosen for a customer exists.
 *
 * @param tx - Prisma transaction.
 * @param priceTableId - Table id, or "" to remove the table.
 * @returns The table id, or null.
 * @throws AppError("not_found").
 */
async function resolveTableId(
  tx: Prisma.TransactionClient,
  priceTableId: string
): Promise<string | null> {
  if (!priceTableId) return null
  const table = await tx.priceTable.findFirst({
    where: { id: priceTableId, deletedAt: null },
    select: { id: true },
  })
  if (!table) throw new AppError(TABLE_NOT_FOUND, "not_found")
  return table.id
}

/**
 * Sets or removes the price table of a corporate account (RF21). Every
 * member of the account buys with it. Audited (RNF12).
 *
 * @param input - Account id and table id ("" removes it).
 * @returns `{ success: true }` or `{ success: false, error }`.
 */
export async function assignOrganizationPriceTable(
  input: AssignOrganizationTableInput
): Promise<ActionResult> {
  try {
    const parsed = assignOrganizationTableSchema.safeParse(input)
    if (!parsed.success) throw new AppError("Revise a atribuição.", "invalid")
    const { user } = await requirePermission("customer:update")
    const { organizationId, priceTableId } = parsed.data

    await prisma.$transaction(async (tx) => {
      const organization = await tx.organization.findFirst({
        where: { id: organizationId, deletedAt: null },
        select: { id: true, priceTableId: true },
      })
      if (!organization) {
        throw new AppError("Conta corporativa não encontrada.", "not_found")
      }
      const tableId = await resolveTableId(tx, priceTableId)
      await tx.organization.update({
        where: { id: organization.id },
        data: { priceTableId: tableId },
      })
      await writeAudit(tx, {
        userId: user.id,
        action: "organization.price_table",
        entity: "organization",
        entityId: organization.id,
        before: { priceTableId: organization.priceTableId },
        after: { priceTableId: tableId },
      })
    })
    return { success: true }
  } catch (error) {
    return toActionError(error, { action: "assignOrganizationPriceTable" })
  }
}

/**
 * Sets or removes the price table of a PF customer found by e-mail
 * (RF21). Members of a corporate account use the table of the account,
 * so they are refused here. Audited (RNF12).
 *
 * @param input - Customer e-mail and table id ("" removes it).
 * @returns `{ success: true, name }` or `{ success: false, error }`.
 */
export async function assignCustomerPriceTable(
  input: AssignCustomerTableInput
): Promise<ActionResult<{ name: string }>> {
  try {
    const parsed = assignCustomerTableSchema.safeParse(input)
    if (!parsed.success) {
      throw new AppError(
        parsed.error.issues[0]?.message ?? "Revise a atribuição.",
        "invalid"
      )
    }
    const { user } = await requirePermission("customer:update")
    const { email, priceTableId } = parsed.data

    const name = await prisma.$transaction(async (tx) => {
      const customer = await tx.user.findFirst({
        where: { email, deletedAt: null },
        select: {
          id: true,
          name: true,
          personType: true,
          priceTableId: true,
          _count: { select: { members: true } },
        },
      })
      if (!customer) {
        throw new AppError(
          "Nenhum cliente encontrado com este e-mail.",
          "not_found"
        )
      }
      if (customer.personType !== "PF" || customer._count.members > 0) {
        throw new AppError(
          "Este cliente compra por uma conta corporativa: atribua a tabela à empresa.",
          "corporate_customer"
        )
      }
      const tableId = await resolveTableId(tx, priceTableId)
      await tx.user.update({
        where: { id: customer.id },
        data: { priceTableId: tableId },
      })
      await writeAudit(tx, {
        userId: user.id,
        action: "user.price_table",
        entity: "user",
        entityId: customer.id,
        before: { priceTableId: customer.priceTableId },
        after: { priceTableId: tableId },
      })
      return customer.name
    })
    return { success: true, name }
  } catch (error) {
    return toActionError(error, { action: "assignCustomerPriceTable" })
  }
}

/**
 * Creates or edits an automatic volume discount of a category (RN04).
 * Audited as a price change (RNF12).
 *
 * @param input - Rule form values.
 * @returns `{ success: true, id }` or `{ success: false, error }`.
 */
export async function saveVolumeDiscount(
  input: VolumeDiscountFormInput
): Promise<ActionResult<{ id: string }>> {
  try {
    const parsed = volumeDiscountFormSchema.safeParse(input)
    if (!parsed.success) {
      throw new AppError(
        parsed.error.issues[0]?.message ?? "Revise o desconto por volume.",
        "invalid"
      )
    }
    const { user } = await requirePermission("customer:update")
    const { id, minAmount, ...data } = parsed.data
    const fields = { ...data, minAmount: minAmount || null }

    const savedId = await prisma.$transaction(async (tx) => {
      const category = await tx.category.findUnique({
        where: { id: data.categoryId },
        select: { id: true },
      })
      if (!category) {
        throw new AppError("Categoria não encontrada.", "invalid_category")
      }
      const include = { category: { select: { name: true } } }
      const before = id
        ? await tx.volumeDiscount.findFirst({
            where: { id, deletedAt: null },
            include,
          })
        : null
      if (id && !before) throw new AppError(RULE_NOT_FOUND, "not_found")
      const rule = id
        ? await tx.volumeDiscount.update({
            where: { id },
            data: fields,
            include,
          })
        : await tx.volumeDiscount.create({ data: fields, include })
      await writeAudit(tx, {
        userId: user.id,
        action: id ? "volume_discount.update" : "volume_discount.create",
        entity: "volume_discount",
        entityId: rule.id,
        before: before ? toVolumeRow(before) : undefined,
        after: toVolumeRow(rule),
      })
      return rule.id
    })
    return { success: true, id: savedId }
  } catch (error) {
    return toActionError(error, { action: "saveVolumeDiscount" })
  }
}

/**
 * Removes a volume discount rule (soft delete), audited (RNF12).
 *
 * @param input - Rule id.
 * @returns `{ success: true }` or `{ success: false, error }`.
 */
export async function removeVolumeDiscount(
  input: PricingIdInput
): Promise<ActionResult> {
  try {
    const parsed = pricingIdSchema.safeParse(input)
    if (!parsed.success) throw new AppError(RULE_NOT_FOUND, "invalid")
    const { user } = await requirePermission("customer:update")
    const { id } = parsed.data

    await prisma.$transaction(async (tx) => {
      const before = await tx.volumeDiscount.findFirst({
        where: { id, deletedAt: null },
        include: { category: { select: { name: true } } },
      })
      if (!before) throw new AppError(RULE_NOT_FOUND, "not_found")
      await tx.volumeDiscount.update({
        where: { id },
        data: { active: false, deletedAt: new Date() },
      })
      await writeAudit(tx, {
        userId: user.id,
        action: "volume_discount.delete",
        entity: "volume_discount",
        entityId: id,
        before: toVolumeRow(before),
      })
    })
    return { success: true }
  } catch (error) {
    return toActionError(error, { action: "removeVolumeDiscount" })
  }
}
