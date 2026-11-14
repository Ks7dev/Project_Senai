import { TagIcon } from "lucide-react"
import type { AppliedPromotion } from "@/features/shared/lib/promotions/promotion-math"

const brl = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
})

/** Promotions of the cart, as the cart and the checkout show them. */
export type PromotionsNoteData = {
  /** Promotions applied. */
  applied: AppliedPromotion[]
  /** Coupon kept on the cart, or null. */
  couponCode: string | null
  /** Why the coupon does not apply, or null when it applies. */
  couponMessage: string | null
}

/**
 * Lists the promotions applied to the order (RF46) and, when the coupon
 * does not apply, why.
 *
 * @param props - Applied promotions and the coupon outcome.
 * @returns The note.
 */
export function PromotionsNote({
  promotions,
}: {
  promotions: PromotionsNoteData
}) {
  return (
    <section
      aria-label="Promoções aplicadas"
      className="flex flex-col gap-xs rounded bg-primary-tint p-sm text-body-sm text-ink"
    >
      {promotions.applied.map((promotion) => (
        <p key={promotion.id} className="flex items-start gap-xs">
          <TagIcon
            className="mt-0.5 size-4 shrink-0 text-primary"
            aria-hidden
          />
          <span>
            {promotion.name}
            {Number(promotion.amount) > 0 &&
              ` · − ${brl.format(Number(promotion.amount))}`}
            {promotion.freeShipping && " · frete cortesia"}
          </span>
        </p>
      ))}
      {promotions.couponCode && promotions.couponMessage && (
        <p role="note" className="text-error">
          Cupom {promotions.couponCode}: {promotions.couponMessage}
        </p>
      )}
    </section>
  )
}
