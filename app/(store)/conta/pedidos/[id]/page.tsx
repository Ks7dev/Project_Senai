import { Suspense } from "react"
import Link from "next/link"
import { notFound, redirect } from "next/navigation"
import { getOrderTracking } from "@/features/orders/order-tracking/action/order-tracking-actions"
import { OrderTrackingView } from "@/features/orders/order-tracking/order-tracking-view"

export const metadata = { title: "Acompanhar pedido — Atelier Bureau" }

/**
 * Loads the order tracking of the logged-in customer.
 *
 * @param props - Route params promise.
 * @returns The tracking content.
 */
async function OrderTrackingContent({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const result = await getOrderTracking({ orderId: id })
  if (!result.success) {
    if (result.error.startsWith("Entre na sua conta")) {
      redirect(`/entrar?redirect=${encodeURIComponent(`/conta/pedidos/${id}`)}`)
    }
    if (
      result.error === "Pedido não encontrado." ||
      result.error === "Pedido inválido."
    ) {
      notFound()
    }
    return (
      <p role="alert" className="text-body text-error">
        {result.error}
      </p>
    )
  }
  return (
    <>
      <header>
        <p className="text-caps text-clay uppercase">Minha conta</p>
        <h1 className="text-headline-xl-mobile lg:text-headline-xl">
          Pedido {result.tracking.number}
        </h1>
      </header>
      <OrderTrackingView tracking={result.tracking} />
      <Link
        href="/conta/pedidos"
        className="text-body-sm text-primary underline"
      >
        Voltar aos pedidos
      </Link>
    </>
  )
}

/**
 * Order tracking route (RF15).
 *
 * @param props - Page props.
 * @returns The page.
 */
export default function OrderTrackingPage(
  props: PageProps<"/conta/pedidos/[id]">
) {
  return (
    <Suspense fallback={<p className="text-body">Carregando pedido…</p>}>
      <OrderTrackingContent params={props.params} />
    </Suspense>
  )
}
