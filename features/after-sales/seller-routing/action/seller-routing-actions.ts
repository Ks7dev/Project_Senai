"use server"

import { revalidatePath } from "next/cache"
import {
  organizationSellerSchema,
  sellerPhoneSchema,
  sellerRuleIdSchema,
  sellerRuleSchema,
  type OrganizationSellerInput,
  type SellerPhoneInput,
  type SellerRuleIdInput,
  type SellerRuleInput,
} from "@/features/after-sales/seller-routing/schema/seller-routing-schema"
import { writeAudit } from "@/features/shared/lib/db/audit"
import { requirePermission } from "@/features/shared/lib/db/permissions"
import { prisma } from "@/features/shared/lib/db/prisma"
import {
  AppError,
  toActionError,
  type ActionResult,
} from "@/features/shared/lib/errors/action-result"
import type { SellerSegment } from "@/features/shared/lib/sellers/seller-routing"

/** Internal role whose users serve as dedicated sellers (RF55). */
const SELLER_ROLE = "sales"

/** Route of the seller routing screen. */
const ROUTING_PATH = "/admin/atendimento/vendedores"

/** A seller of the sales team. */
export type SellerOption = {
  /** User id. */
  id: string
  /** Name. */
  name: string
  /** WhatsApp number (digits), if registered. */
  phone: string | null
}

/** A seller rule of the screen. */
export type SellerRuleRow = {
  /** Rule id. */
  id: string
  /** Seller name. */
  sellerName: string
  /** Segment; null means any. */
  personType: SellerSegment | null
  /** State; null means any. */
  state: string | null
}

/** A corporate account and its seller. */
export type AccountSellerRow = {
  /** Organization id. */
  id: string
  /** Account name. */
  name: string
  /** Seller id, if assigned. */
  sellerId: string | null
}

/** Everything the seller routing screen shows (RN11). */
export type SellerRouting = {
  sellers: SellerOption[]
  rules: SellerRuleRow[]
  accounts: AccountSellerRow[]
}

/**
 * Loads a user of the sales team, refusing anybody else.
 *
 * @param sellerId - User id from the form.
 * @returns The seller.
 * @throws AppError("invalid_seller").
 */
async function requireSeller(sellerId: string) {
  const seller = await prisma.user.findFirst({
    where: {
      id: sellerId,
      deletedAt: null,
      userRoles: { some: { role: { key: SELLER_ROLE } } },
    },
    select: { id: true, name: true, phone: true },
  })
  if (!seller) {
    throw new AppError(
      "Escolha um vendedor da equipe comercial.",
      "invalid_seller"
    )
  }
  return seller
}

/**
 * Loads the seller routing of the back office (RF18, RN11): the sales
 * team with their WhatsApp numbers, the active rules by region and
 * segment, and the seller of each corporate account. Needs
 * `customer:update`.
 *
 * @returns `{ success: true, routing }` or `{ success: false, error }`.
 */
export async function getSellerRouting(): Promise<
  ActionResult<{ routing: SellerRouting }>
> {
  try {
    await requirePermission("customer:update")
    const [sellers, rules, accounts] = await Promise.all([
      prisma.user.findMany({
        where: {
          deletedAt: null,
          userRoles: { some: { role: { key: SELLER_ROLE } } },
        },
        orderBy: { name: "asc" },
        select: { id: true, name: true, phone: true },
      }),
      prisma.sellerRule.findMany({
        where: { active: true },
        orderBy: [{ state: "asc" }, { personType: "asc" }],
        select: {
          id: true,
          personType: true,
          state: true,
          seller: { select: { name: true } },
        },
      }),
      prisma.organization.findMany({
        where: { deletedAt: null },
        orderBy: { name: "asc" },
        take: 200,
        select: { id: true, name: true, sellerId: true },
      }),
    ])
    return {
      success: true,
      routing: {
        sellers,
        rules: rules.map((rule) => ({
          id: rule.id,
          sellerName: rule.seller.name,
          personType: rule.personType,
          state: rule.state,
        })),
        accounts,
      },
    }
  } catch (error) {
    return toActionError(error, { action: "getSellerRouting" })
  }
}

/**
 * Creates a rule that assigns a seller to a region and/or segment
 * (RN11). Only one active rule per region and segment. Needs
 * `customer:update`; writes the audit log (RNF12).
 *
 * @param input - Seller, segment and state.
 * @returns `{ success: true }` or `{ success: false, error }`.
 */
export async function createSellerRule(
  input: SellerRuleInput
): Promise<ActionResult> {
  try {
    const parsed = sellerRuleSchema.safeParse(input)
    if (!parsed.success) {
      throw new AppError(
        parsed.error.issues[0]?.message ?? "Revise a regra.",
        "invalid"
      )
    }
    const { user } = await requirePermission("customer:update")
    const seller = await requireSeller(parsed.data.sellerId)
    const personType = parsed.data.personType || null
    const state = parsed.data.state || null
    await prisma.$transaction(async (tx) => {
      const existing = await tx.sellerRule.findFirst({
        where: { active: true, personType, state },
        select: { id: true },
      })
      if (existing) {
        throw new AppError(
          "Já existe uma regra ativa para esta região e este segmento. Desative-a antes.",
          "duplicate_rule"
        )
      }
      const rule = await tx.sellerRule.create({
        data: { sellerId: seller.id, personType, state },
        select: { id: true },
      })
      await writeAudit(tx, {
        userId: user.id,
        action: "seller_rule.create",
        entity: "seller_rule",
        entityId: rule.id,
        after: { sellerId: seller.id, personType, state },
      })
    })
    revalidatePath(ROUTING_PATH)
    return { success: true }
  } catch (error) {
    return toActionError(error, { action: "createSellerRule" })
  }
}

/**
 * Deactivates a seller rule (kept for the history). Needs
 * `customer:update`; writes the audit log (RNF12).
 *
 * @param input - Rule id.
 * @returns `{ success: true }` or `{ success: false, error }`.
 */
export async function deactivateSellerRule(
  input: SellerRuleIdInput
): Promise<ActionResult> {
  try {
    const parsed = sellerRuleIdSchema.safeParse(input)
    if (!parsed.success) throw new AppError("Regra inválida.", "invalid")
    const { user } = await requirePermission("customer:update")
    await prisma.$transaction(async (tx) => {
      const changed = await tx.sellerRule.updateMany({
        where: { id: parsed.data.ruleId, active: true },
        data: { active: false },
      })
      if (changed.count === 0) {
        throw new AppError("Regra não encontrada.", "not_found")
      }
      await writeAudit(tx, {
        userId: user.id,
        action: "seller_rule.deactivate",
        entity: "seller_rule",
        entityId: parsed.data.ruleId,
        before: { active: true },
        after: { active: false },
      })
    })
    revalidatePath(ROUTING_PATH)
    return { success: true }
  } catch (error) {
    return toActionError(error, { action: "deactivateSellerRule" })
  }
}

/**
 * Assigns (or removes) the dedicated seller of a corporate account
 * (RN11). Only the back office changes it; the customer never does.
 * Needs `customer:update`; writes the audit log (RNF12).
 *
 * @param input - Account and seller (empty removes it).
 * @returns `{ success: true }` or `{ success: false, error }`.
 */
export async function assignOrganizationSeller(
  input: OrganizationSellerInput
): Promise<ActionResult> {
  try {
    const parsed = organizationSellerSchema.safeParse(input)
    if (!parsed.success) throw new AppError("Revise a conta.", "invalid")
    const { user } = await requirePermission("customer:update")
    const sellerId = parsed.data.sellerId
      ? (await requireSeller(parsed.data.sellerId)).id
      : null
    await prisma.$transaction(async (tx) => {
      const organization = await tx.organization.findFirst({
        where: { id: parsed.data.organizationId, deletedAt: null },
        select: { id: true, sellerId: true },
      })
      if (!organization) {
        throw new AppError("Conta não encontrada.", "not_found")
      }
      await tx.organization.update({
        where: { id: organization.id },
        data: { sellerId },
      })
      await writeAudit(tx, {
        userId: user.id,
        action: "organization.seller",
        entity: "organization",
        entityId: organization.id,
        before: { sellerId: organization.sellerId },
        after: { sellerId },
      })
    })
    revalidatePath(ROUTING_PATH)
    return { success: true }
  } catch (error) {
    return toActionError(error, { action: "assignOrganizationSeller" })
  }
}

/**
 * Registers the WhatsApp number of a seller (RF18). Needs
 * `customer:update`; writes the audit log (RNF12).
 *
 * @param input - Seller and phone with area code.
 * @returns `{ success: true }` or `{ success: false, error }`.
 */
export async function updateSellerPhone(
  input: SellerPhoneInput
): Promise<ActionResult> {
  try {
    const parsed = sellerPhoneSchema.safeParse(input)
    if (!parsed.success) {
      throw new AppError(
        parsed.error.issues[0]?.message ?? "Revise o WhatsApp.",
        "invalid"
      )
    }
    const { user } = await requirePermission("customer:update")
    const seller = await requireSeller(parsed.data.sellerId)
    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: seller.id },
        data: { phone: parsed.data.phone },
      })
      await writeAudit(tx, {
        userId: user.id,
        action: "seller.phone",
        entity: "user",
        entityId: seller.id,
        before: { phone: Boolean(seller.phone) },
        after: { phone: true },
      })
    })
    revalidatePath(ROUTING_PATH)
    return { success: true }
  } catch (error) {
    return toActionError(error, { action: "updateSellerPhone" })
  }
}
