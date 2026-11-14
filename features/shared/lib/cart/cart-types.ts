import type { PricedService } from "@/features/shared/lib/cart/cart-extras"
import type { Personalization } from "@/features/shared/schema/cart-schema"

/** A line of the cart or of a saved project list, as the UI shows it. */
export type CartLine = {
  /** Cart item id. */
  id: string
  /** SKU code. */
  skuCode: string
  /** Variation name. */
  skuName: string
  /** Product name. */
  productName: string
  /** Product slug, for the link to the product page. */
  productSlug: string
  /** Storage key of the first product image. */
  imageKey: string | null
  /** Category of the product, used by the volume discounts (RN04). */
  categoryId: string
  /** Category name. */
  categoryName: string
  /** Quantity. */
  quantity: number
  /**
   * Current unit price for the customer as a decimal string: the catalog
   * price with the discount of the customer table (RF21).
   */
  unitPrice: string
  /** Catalog unit price when the customer table lowers it, otherwise null. */
  listUnitPrice: string | null
  /** Quantity × unit price as a decimal string. */
  total: string
  /** False when the product or variation left the catalog. */
  purchasable: boolean
  /** Product accepts laser engraving (RF51). */
  personalizable: boolean
  /** Product is furniture with installation (RN05). */
  requiresInstallation: boolean
  /** Laser engraving chosen for the line, or null. */
  personalization: Personalization | null
  /** Engraving cost of the line as a decimal string. */
  engravingTotal: string
  /** Additional services chosen for the line (RF52). */
  services: PricedService[]
  /** Engraving plus services of the line as a decimal string. */
  extrasTotal: string
  /** Business days the extras add to the line lead time. */
  extraBusinessDays: number
}

/** A volume discount applied to the cart (RN04). */
export type CartVolumeDiscount = {
  /** Category name. */
  categoryName: string
  /** Discount in basis points (1% = 100). */
  basisPoints: number
  /** Units of the category in the cart. */
  quantity: number
  /** Discount amount as a decimal string. */
  amount: string
}

/** Cart or saved project list with its totals. */
export type CartView = {
  /** Lines, oldest first. */
  lines: CartLine[]
  /** Number of units of the purchasable lines. */
  count: number
  /** Sum of the purchasable lines as a decimal string. */
  subtotal: string
  /** Automatic volume discounts (RN04) as a decimal string. */
  discount: string
  /** Volume discounts applied, one per category at most (RN04). */
  volumeDiscounts: CartVolumeDiscount[]
  /** Name of the customer price table (RF21), or null. */
  priceTableName: string | null
  /** Engraving and additional services as a decimal string. */
  servicesTotal: string
  /**
   * Subtotal minus the volume discounts plus services, before shipping,
   * as a decimal string.
   */
  total: string
  /** Business days the extras add to the order lead time (largest line). */
  extraBusinessDays: number
}

/** A saved project list (RF07). */
export type ProjectListView = CartView & {
  /** List id. */
  id: string
  /** Name given by the customer. */
  name: string
  /** Last change, ISO string. */
  updatedAt: string
}
