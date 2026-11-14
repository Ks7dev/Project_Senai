import { Suspense } from "react"
import { listPromotions } from "@/features/backoffice/promotions/action/promotion-actions"
import { PromotionsView } from "@/features/backoffice/promotions/promotions-view"
import { requirePagePermission } from "@/features/shared/lib/db/page-guard"

export const metadata = { title: "Promoções — Atelier Bureau" }

/**
 * Loads the promotions after checking the permission.
 *
 * @returns The manager or the error message.
 */
async function PromotionsSection() {
  await requirePagePermission("promotion:manage", "/admin/promocoes")
  const result = await listPromotions()
  if (!result.success) {
    return (
      <p role="alert" className="text-body text-error">
        {result.error}
      </p>
    )
  }
  return (
    <PromotionsView
      promotions={result.promotions}
      products={result.products}
      categories={result.categories}
    />
  )
}

/**
 * Back office route of promotions, coupons and courtesy shipping (#73).
 *
 * @returns The page.
 */
export default function AdminPromotionsPage() {
  return (
    <div className="flex flex-col gap-lg">
      <header>
        <p className="text-caps text-clay uppercase">Comercial</p>
        <h1 className="text-headline-xl-mobile lg:text-headline-xl">
          Promoções e cupons
        </h1>
      </header>
      <Suspense fallback={<p className="text-body">Carregando promoções…</p>}>
        <PromotionsSection />
      </Suspense>
    </div>
  )
}
