"use server"

import {
  sellerContactSourceSchema,
  type SellerContactSource,
} from "@/features/after-sales/seller-contact/schema/seller-contact-schema"
import { getCurrentUser } from "@/features/shared/lib/auth/session"
import { prisma } from "@/features/shared/lib/db/prisma"
import {
  toActionError,
  type ActionResult,
} from "@/features/shared/lib/errors/action-result"
import { resolveDedicatedSeller } from "@/features/shared/lib/sellers/dedicated-seller"
import {
  sellerGreeting,
  whatsappLink,
} from "@/features/shared/lib/sellers/seller-routing"

/** What the seller contact page shows (RF18). */
export type SellerContact = {
  /** Whether a customer is logged in. */
  loggedIn: boolean
  /** Product the customer came from, if any. */
  product: { name: string; slug: string } | null
  /** Whether the customer came from the cart. */
  fromCart: boolean
  /** The seller, or null when none is configured. */
  seller: {
    /** Seller name. */
    name: string
    /** Whether the seller is the one of the corporate account. */
    dedicated: boolean
    /** WhatsApp link with the first message, or null without phone. */
    whatsappUrl: string | null
  } | null
}

/**
 * Loads the seller contact of the customer (RF18, RN11): the seller of
 * the account, defined by the store by region or segment and never by
 * the customer, with a WhatsApp link that already names the product or
 * the cart. Visitors get the general seller.
 *
 * @param input - Query string: `produto` or `origem=carrinho`.
 * @returns `{ success: true, contact }` or `{ success: false, error }`.
 */
export async function getSellerContact(
  input: SellerContactSource
): Promise<ActionResult<{ contact: SellerContact }>> {
  try {
    const source = sellerContactSourceSchema.parse(input ?? {})
    const user = await getCurrentUser()
    const product = source.produto
      ? await prisma.product.findFirst({
          where: { slug: source.produto, status: "ACTIVE", deletedAt: null },
          select: { name: true, slug: true },
        })
      : null
    const fromCart = !product && source.origem === "carrinho"
    const seller = await resolveDedicatedSeller(user)
    return {
      success: true,
      contact: {
        loggedIn: user !== null,
        product,
        fromCart,
        seller: seller
          ? {
              name: seller.name,
              dedicated: user !== null,
              whatsappUrl: whatsappLink(
                seller.phone,
                sellerGreeting({
                  sellerName: seller.name,
                  productName: product?.name,
                  fromCart,
                })
              ),
            }
          : null,
      },
    }
  } catch (error) {
    return toActionError(error, { action: "getSellerContact" })
  }
}
