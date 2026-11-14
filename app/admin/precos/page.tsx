import { Suspense } from "react"
import { getPricingAdmin } from "@/features/cart/price-tables/action/price-table-actions"
import { PriceTablesView } from "@/features/cart/price-tables/price-tables-view"
import { requirePagePermission } from "@/features/shared/lib/db/page-guard"

export const metadata = { title: "Preços e descontos — Atelier Bureau" }

/**
 * Loads the price tables and volume discounts after checking the
 * permission.
 *
 * @returns The editor or the error message.
 */
async function PricingSection() {
  await requirePagePermission("customer:update", "/admin/precos")
  const result = await getPricingAdmin()
  if (!result.success) {
    return (
      <p role="alert" className="text-body text-error">
        {result.error}
      </p>
    )
  }
  return <PriceTablesView data={result.data} />
}

/**
 * Back office route of the customer price tables and the volume
 * discounts (#52, RF21, RN04).
 *
 * @returns The page.
 */
export default function AdminPricingPage() {
  return (
    <div className="flex flex-col gap-lg">
      <header>
        <p className="text-caps text-clay uppercase">Comercial</p>
        <h1 className="text-headline-xl-mobile lg:text-headline-xl">
          Tabelas de preço e descontos por volume
        </h1>
      </header>
      <Suspense fallback={<p className="text-body">Carregando preços…</p>}>
        <PricingSection />
      </Suspense>
    </div>
  )
}
