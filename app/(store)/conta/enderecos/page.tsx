import { Suspense } from "react"
import { redirect } from "next/navigation"
import { listAddresses } from "@/features/account/addresses/action/address-actions"
import { AddressesView } from "@/features/account/addresses/addresses-view"

export const metadata = { title: "Endereços — Atelier Bureau" }

/**
 * Loads the delivery addresses of the account.
 *
 * @returns The addresses page.
 */
async function Addresses() {
  const result = await listAddresses()
  if (!result.success) {
    if (result.error.startsWith("Entre na sua conta")) {
      redirect("/entrar?redirect=%2Fconta%2Fenderecos")
    }
    return (
      <p role="alert" className="text-body text-error">
        {result.error}
      </p>
    )
  }
  return (
    <AddressesView addresses={result.addresses} canManage={result.canManage} />
  )
}

/**
 * Delivery addresses route (#36, RF26).
 *
 * @returns The page.
 */
export default function AddressesPage() {
  return (
    <>
      <header>
        <p className="text-caps text-clay uppercase">Minha conta</p>
        <h1 className="text-headline-xl-mobile lg:text-headline-xl">
          Endereços de entrega
        </h1>
      </header>
      <Suspense fallback={<p className="text-body">Carregando endereços…</p>}>
        <Addresses />
      </Suspense>
    </>
  )
}
