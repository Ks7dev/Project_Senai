import { Suspense } from "react"
import Link from "next/link"
import { getSellerRouting } from "@/features/after-sales/seller-routing/action/seller-routing-actions"
import { SellerRoutingView } from "@/features/after-sales/seller-routing/seller-routing-view"
import { requirePagePermission } from "@/features/shared/lib/db/page-guard"

export const metadata = { title: "Vendedores — Atelier Bureau" }

/**
 * Loads the seller routing after checking the permission.
 *
 * @returns The screen or the error message.
 */
async function RoutingSection() {
  await requirePagePermission(
    "customer:update",
    "/admin/atendimento/vendedores"
  )
  const result = await getSellerRouting()
  if (!result.success) {
    return (
      <p role="alert" className="text-body text-error">
        {result.error}
      </p>
    )
  }
  return <SellerRoutingView routing={result.routing} />
}

/**
 * Back office route of the dedicated sellers (#69, RF18, RN11).
 *
 * @returns The page.
 */
export default function AdminSellersPage() {
  return (
    <div className="flex flex-col gap-lg">
      <Link
        href="/admin/atendimento"
        className="text-body-sm text-primary underline"
      >
        Voltar ao atendimento
      </Link>
      <header>
        <p className="text-caps text-clay uppercase">Pós-venda</p>
        <h1 className="text-headline-xl-mobile lg:text-headline-xl">
          Vendedores dedicados
        </h1>
        <p className="text-body text-ink-muted">
          Quem atende cada cliente pelo WhatsApp, por região e segmento.
        </p>
      </header>
      <Suspense fallback={<p className="text-body">Carregando vendedores…</p>}>
        <RoutingSection />
      </Suspense>
    </div>
  )
}
