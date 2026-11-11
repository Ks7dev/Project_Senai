import { Suspense } from "react"
import { redirect } from "next/navigation"
import { PageContainer } from "@/components/layout/page-container"
import { getCheckout } from "@/features/payment/checkout/action/checkout-actions"
import { CheckoutView } from "@/features/payment/checkout/checkout-view"

export const metadata = { title: "Finalizar compra — Atelier Bureau" }

/**
 * Loads the cart, the saved addresses and the payment methods of the
 * logged-in customer.
 *
 * @returns The checkout content.
 */
async function Checkout() {
  const result = await getCheckout()
  if (!result.success) {
    if (result.error.startsWith("Entre na sua conta")) {
      redirect("/entrar?redirect=%2Fcheckout")
    }
    return (
      <p role="alert" className="text-body text-error">
        {result.error}
      </p>
    )
  }
  return <CheckoutView context={result.context} />
}

/**
 * Checkout route (RF25, RF28, RF29).
 *
 * @returns The page.
 */
export default function CheckoutPage() {
  return (
    <PageContainer className="flex flex-col gap-xl py-xl">
      <header>
        <p className="text-caps text-clay uppercase">Checkout</p>
        <h1 className="text-headline-xl-mobile lg:text-headline-xl">
          Finalizar compra
        </h1>
      </header>
      <Suspense fallback={<p className="text-body">Carregando checkout…</p>}>
        <Checkout />
      </Suspense>
    </PageContainer>
  )
}
