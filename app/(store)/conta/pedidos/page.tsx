import { Suspense } from "react"
import Link from "next/link"
import { redirect } from "next/navigation"
import { AccountOrdersTable } from "@/features/account/overview/account-views"
import {
  listAccountOrders,
  loadAccountContext,
} from "@/features/account/overview/load-account"
import {
  ORDER_STATUS,
  type OrderStatusKey,
} from "@/features/shared/lib/orders/order-status"
import { cn } from "@/lib/utils"

export const metadata = { title: "Meus pedidos — Atelier Bureau" }

const FILTERS: Array<[string, string]> = [
  ["", "Todos"],
  ...Object.entries(ORDER_STATUS).map(
    ([key, value]) => [key, value.label] as [string, string]
  ),
]

/**
 * Loads the orders visible to the user, filtered by status.
 *
 * @param props - Search params promise.
 * @returns The orders list.
 */
async function Orders({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>
}) {
  const context = await loadAccountContext()
  if (!context) redirect("/entrar?redirect=%2Fconta%2Fpedidos")
  const { status } = await searchParams
  const valid =
    status && status in ORDER_STATUS ? (status as OrderStatusKey) : undefined
  const orders = await listAccountOrders(context, { status: valid, take: 100 })
  return (
    <>
      <header>
        <p className="text-caps text-clay uppercase">Minha conta</p>
        <h1 className="text-headline-xl-mobile lg:text-headline-xl">
          {context.seesCompanyOrders ? "Pedidos da empresa" : "Meus pedidos"}
        </h1>
      </header>
      <nav aria-label="Filtrar por status" className="flex flex-wrap gap-sm">
        {FILTERS.map(([key, label]) => {
          const active = (valid ?? "") === key
          return (
            <Link
              key={key || "todos"}
              href={key ? `/conta/pedidos?status=${key}` : "/conta/pedidos"}
              aria-current={active ? "true" : undefined}
              className={cn(
                "rounded-full border px-md py-1 text-label-sm",
                active
                  ? "border-primary bg-primary-tint text-primary"
                  : "border-line-subtle text-ink-muted hover:text-ink"
              )}
            >
              {label}
            </Link>
          )
        })}
      </nav>
      <AccountOrdersTable
        orders={orders}
        showBuyer={context.seesCompanyOrders}
      />
    </>
  )
}

/**
 * Customer orders route (#37, RF15).
 *
 * @param props - Page props.
 * @returns The page.
 */
export default function AccountOrdersPage(props: PageProps<"/conta/pedidos">) {
  return (
    <Suspense fallback={<p className="text-body">Carregando pedidos…</p>}>
      <Orders
        searchParams={props.searchParams as Promise<{ status?: string }>}
      />
    </Suspense>
  )
}
