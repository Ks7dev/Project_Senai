import { Suspense } from "react"
import { requirePagePermission } from "@/features/shared/lib/db/page-guard"
import { listShippingRegions } from "@/features/shipping/regions/action/region-actions"
import { RegionsView } from "@/features/shipping/regions/regions-view"

export const metadata = { title: "Frete e cobertura — Atelier Bureau" }

/**
 * Loads the delivery regions after checking the permission.
 *
 * @returns The manager or the error message.
 */
async function RegionsSection() {
  await requirePagePermission("setting:manage", "/admin/frete")
  const result = await listShippingRegions()
  if (!result.success) {
    return (
      <p role="alert" className="text-body text-error">
        {result.error}
      </p>
    )
  }
  return <RegionsView regions={result.regions} />
}

/**
 * Back office route of the own delivery coverage and price table (#43).
 *
 * @returns The page.
 */
export default function AdminShippingPage() {
  return (
    <div className="flex flex-col gap-lg">
      <header>
        <p className="text-caps text-clay uppercase">Frete</p>
        <h1 className="text-headline-xl-mobile lg:text-headline-xl">
          Entrega própria e cobertura
        </h1>
      </header>
      <Suspense fallback={<p className="text-body">Carregando regiões…</p>}>
        <RegionsSection />
      </Suspense>
    </div>
  )
}
