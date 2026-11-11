import { Suspense } from "react"
import Link from "next/link"
import { redirect } from "next/navigation"
import { buttonVariants } from "@/components/ui/button"
import { listMyQuotes } from "@/features/cart/customer-quotes/action/customer-quotes-actions"
import { CustomerQuotesView } from "@/features/cart/customer-quotes/customer-quotes-view"
import { UNAUTHENTICATED_MESSAGE } from "@/features/shared/lib/db/permissions"

export const metadata = { title: "Minhas cotações — Atelier Bureau" }

/**
 * Loads the quotes the customer follows.
 *
 * @returns The list.
 */
async function Quotes() {
  const result = await listMyQuotes()
  if (!result.success) {
    if (result.error === UNAUTHENTICATED_MESSAGE) {
      redirect("/entrar?redirect=%2Fconta%2Fcotacoes")
    }
    return (
      <p role="alert" className="text-body text-error">
        {result.error}
      </p>
    )
  }
  return (
    <>
      <header className="flex flex-wrap items-end justify-between gap-md">
        <div>
          <p className="text-caps text-clay uppercase">Minha conta</p>
          <h1 className="text-headline-xl-mobile lg:text-headline-xl">
            {result.companyWide ? "Cotações da empresa" : "Minhas cotações"}
          </h1>
        </div>
        <Link
          href="/cotacao/nova?origem=carrinho"
          className={buttonVariants({ variant: "ghost", size: "sm" })}
        >
          Cotar o carrinho
        </Link>
      </header>
      <CustomerQuotesView
        quotes={result.quotes}
        companyWide={result.companyWide}
      />
    </>
  )
}

/**
 * Customer quotes route (#48, RF05, RF06).
 *
 * @returns The page.
 */
export default function AccountQuotesPage() {
  return (
    <Suspense fallback={<p className="text-body">Carregando cotações…</p>}>
      <Quotes />
    </Suspense>
  )
}
