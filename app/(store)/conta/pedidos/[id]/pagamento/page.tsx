import { Suspense } from "react"
import Link from "next/link"
import { notFound, redirect } from "next/navigation"
import { getOrderPayment } from "@/features/payment/order-payment/action/payment-actions"
import { OrderPaymentView } from "@/features/payment/order-payment/order-payment-view"

export const metadata = { title: "Pagamento do pedido — Atelier Bureau" }

/**
 * Loads the order payment of the logged-in customer.
 *
 * @param props - Route params promise.
 * @returns The payment content.
 */
async function OrderPayment({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const result = await getOrderPayment({ orderId: id })
  if (!result.success) {
    if (result.error.startsWith("Entre na sua conta")) {
      redirect(
        `/entrar?redirect=${encodeURIComponent(`/conta/pedidos/${id}/pagamento`)}`
      )
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
        <p className="text-caps text-clay uppercase">
          Pedido {result.context.number}
        </p>
        <h1 className="text-headline-xl-mobile lg:text-headline-xl">
          Pagamento
        </h1>
      </header>
      <OrderPaymentView context={result.context} />
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
 * Order payment route (RF28, RF31).
 *
 * @param props - Page props.
 * @returns The page.
 */
export default function OrderPaymentPage(
  props: PageProps<"/conta/pedidos/[id]/pagamento">
) {
  return (
    <Suspense fallback={<p className="text-body">Carregando pagamento…</p>}>
      <OrderPayment params={props.params} />
    </Suspense>
  )
}
