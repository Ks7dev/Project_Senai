import { PackageIcon, TagIcon } from "lucide-react"
import type { CartVolumeDiscount } from "@/features/shared/lib/cart/cart-types"
import { formatPercent } from "@/features/shared/lib/pricing/pricing-math"

const brl = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
})

/** What the cart pricing notes show. */
export type CartPricingNotesProps = {
  /** Name of the customer price table (RF21), or null. */
  priceTableName: string | null
  /** Volume discounts applied to the cart (RN04). */
  volumeDiscounts: CartVolumeDiscount[]
}

/**
 * Explains the prices of the cart and the checkout: the customer price
 * table in use (RF21) and each automatic volume discount by category
 * (RN04). Renders nothing when neither applies.
 *
 * @param props - Price table name and volume discounts.
 * @returns The notes, or null.
 */
export function CartPricingNotes({
  priceTableName,
  volumeDiscounts,
}: CartPricingNotesProps) {
  if (!priceTableName && volumeDiscounts.length === 0) return null
  return (
    <div className="flex flex-col gap-xs rounded bg-primary-tint p-sm text-body-sm text-ink">
      {priceTableName && (
        <p className="flex items-center gap-xs">
          <TagIcon className="size-4 shrink-0 text-primary" aria-hidden />
          Preços da sua tabela: {priceTableName}.
        </p>
      )}
      {volumeDiscounts.length > 0 && (
        <ul aria-label="Descontos por volume" className="flex flex-col gap-xs">
          {volumeDiscounts.map((item) => (
            <li key={item.categoryName} className="flex items-start gap-xs">
              <PackageIcon
                className="mt-0.5 size-4 shrink-0 text-primary"
                aria-hidden
              />
              <span>
                Desconto por volume de {formatPercent(item.basisPoints)} em{" "}
                {item.categoryName} ({item.quantity}{" "}
                {item.quantity === 1 ? "unidade" : "unidades"}): −{" "}
                {brl.format(Number(item.amount))}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
