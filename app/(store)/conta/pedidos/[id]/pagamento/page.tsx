import { Suspense } from "react"
import Link from "next/link"
import { notFound, redirect } from "next/navigation"
import { getOrderPayment } from "@/features/payment/order-payment/action/payment-actions"
import { OrderPaymentView } from "@/features/payment/order-payment/order-payment-view"
import { getRequestNonce } from "@/features/shared/lib/security/nonce"

export const metadata = { title: "Pagamento do pedido — Atelier Bureau" }

/**
 * The whole page renders at request time, without a static shell, so
 * every script of the document carries the CSP nonce (#173).
 */
export const instant = false

/**
 * Loads the order payment of the logged-in customer.
 *
 * @param props - Route params promise.
 * @returns The payment content.
 */
async function OrderPayment({
  params,
  nonce,
}: {
  params: Promise<{ id: string }>
  nonce?: string
}) {
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
      <OrderPaymentView context={result.context} nonce={nonce} />
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
 * Order payment route (RF28, RF31). Reads the CSP nonce before any
 * Suspense boundary, so the document is rendered per request (#173).
 *
 * @param props - Page props.
 * @returns The page.
 */
export default async function OrderPaymentPage(
  props: PageProps<"/conta/pedidos/[id]/pagamento">
) {
  const nonce = await getRequestNonce()
  return (
    <Suspense fallback={<p className="text-body">Carregando pagamento…</p>}>
      <OrderPayment params={props.params} nonce={nonce} />
    </Suspense>
  )
}
