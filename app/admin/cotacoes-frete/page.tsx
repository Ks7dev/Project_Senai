import { Suspense } from "react"
import { hasPermission } from "@/features/shared/lib/auth/permissions"
import { requirePagePermission } from "@/features/shared/lib/db/page-guard"
import { listManualShippingQuotes } from "@/features/shipping/manual-quotes/action/manual-quote-actions"
import { ManualQuotesView } from "@/features/shipping/manual-quotes/manual-quotes-view"

export const metadata = { title: "Cotações de frete — Atelier Bureau" }

/**
 * Loads the queue after checking the permission.
 *
 * @returns The queue or the error message.
 */
async function QueueSection() {
  const { permissions } = await requirePagePermission(
    "quote:read",
    "/admin/cotacoes-frete"
  )
  const result = await listManualShippingQuotes()
  if (!result.success) {
    return (
      <p role="alert" className="text-body text-error">
        {result.error}
      </p>
    )
  }
  return (
    <ManualQuotesView
      orders={result.orders}
      canAnswer={hasPermission(permissions, "quote:answer")}
    />
  )
}

/**
 * Back office route of the manual shipping quote queue (#44).
 *
 * @returns The page.
 */
export default function AdminShippingQuotesPage() {
  return (
    <div className="flex flex-col gap-lg">
      <header>
        <p className="text-caps text-clay uppercase">Comercial</p>
        <h1 className="text-headline-xl-mobile lg:text-headline-xl">
          Cotações de frete
        </h1>
      </header>
      <Suspense fallback={<p className="text-body">Carregando pedidos…</p>}>
        <QueueSection />
      </Suspense>
    </div>
  )
}
