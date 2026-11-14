import "server-only"
import type { SessionUser } from "@/features/shared/lib/auth/session"
import { getCorporateContext } from "@/features/shared/lib/db/corporate"
import { prisma } from "@/features/shared/lib/db/prisma"
import {
  pickSellerRule,
  type SellerSegment,
} from "@/features/shared/lib/sellers/seller-routing"

/** The dedicated seller of a customer (RF18, RN11). */
export type DedicatedSeller = {
  /** Seller user id. */
  id: string
  /** Seller name. */
  name: string
  /** Seller e-mail, to notify the seller (never shown to visitors). */
  email: string
  /** Phone (digits), used for the WhatsApp link. */
  phone: string | null
  /** Where the seller comes from: the corporate account or a rule. */
  source: "account" | "rule"
}

/** Seller fields loaded from `users`. */
const sellerSelect = {
  id: true,
  name: true,
  email: true,
  phone: true,
  deletedAt: true,
} as const

/**
 * Region (state) of the customer: the default address of the corporate
 * account or of the user, or the most recent one.
 *
 * @param where - Owner of the addresses.
 * @returns The state (UF), or null without addresses.
 */
async function customerState(
  where: { organizationId: string } | { userId: string }
): Promise<string | null> {
  const address = await prisma.address.findFirst({
    where: { ...where, deletedAt: null },
    orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }],
    select: { state: true },
  })
  return address?.state ?? null
}

/**
 * Finds the dedicated seller of the logged-in customer, or the general
 * seller for visitors (RF18, RN11). A corporate account with a seller
 * assigned by the back office keeps it; everybody else follows the most
 * specific active rule for their region and segment. The customer never
 * chooses: the user comes from the session and nothing in the request
 * changes the result.
 *
 * @param user - Session user, or null for visitors.
 * @returns The seller, or null when none is configured.
 */
export async function resolveDedicatedSeller(
  user: SessionUser | null
): Promise<DedicatedSeller | null> {
  let segment: SellerSegment | null = null
  let state: string | null = null

  if (user) {
    const corporate = await getCorporateContext()
    if (corporate) {
      const organization = await prisma.organization.findUnique({
        where: { id: corporate.organizationId },
        select: { seller: { select: sellerSelect } },
      })
      const seller = organization?.seller
      if (seller && !seller.deletedAt) {
        return {
          id: seller.id,
          name: seller.name,
          email: seller.email,
          phone: seller.phone,
          source: "account",
        }
      }
      segment = "PJ"
      state = await customerState({
        organizationId: corporate.organizationId,
      })
    } else {
      const profile = await prisma.user.findUnique({
        where: { id: user.id },
        select: { personType: true },
      })
      segment = profile?.personType ?? null
      state = await customerState({ userId: user.id })
    }
  }

  const rules = await prisma.sellerRule.findMany({
    where: { active: true, seller: { deletedAt: null } },
    select: {
      id: true,
      sellerId: true,
      personType: true,
      state: true,
      createdAt: true,
      seller: { select: sellerSelect },
    },
  })
  const rule = pickSellerRule(rules, { personType: segment, state })
  if (!rule) return null
  return {
    id: rule.seller.id,
    name: rule.seller.name,
    email: rule.seller.email,
    phone: rule.seller.phone,
    source: "rule",
  }
}
