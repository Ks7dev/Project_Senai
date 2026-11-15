import { Suspense } from "react"
import Link from "next/link"
import { notFound, redirect } from "next/navigation"
import { getAddressChange } from "@/features/orders/address-change/action/address-change-actions"
import { AddressChangeView } from "@/features/orders/address-change/address-change-view"

export const metadata = { title: "Alterar endereço do pedido — Atelier Bureau" }

/**
 * Loads the order and the saved addresses of the account.
 *
 * @param props - Route params promise.
 * @returns The address change content.
 */
async function AddressChange({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const result = await getAddressChange({ orderId: id })
  if (!result.success) {
    if (result.error.startsWith("Entre na sua conta")) {
      redirect(
        `/entrar?redirect=${encodeURIComponent(`/conta/pedidos/${id}/endereco`)}`
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
          Alterar endereço de entrega
        </h1>
        <p className="text-body-sm text-ink-muted">
          A mudança de endereço exige uma nova cotação de frete e prazo. Você
          confere a diferença antes de confirmar.
        </p>
      </header>
      <AddressChangeView context={result.context} />
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
 * Order address change route (#45, RN15).
 *
 * @param props - Page props.
 * @returns The page.
 */
export default function OrderAddressChangePage(
  props: PageProps<"/conta/pedidos/[id]/endereco">
) {
  return (
    <Suspense fallback={<p className="text-body">Carregando pedido…</p>}>
      <AddressChange params={props.params} />
    </Suspense>
  )
}
