import { Suspense } from "react"
import Link from "next/link"
import { redirect } from "next/navigation"
import {
  AccountOrdersTable,
  SummaryCard,
} from "@/features/account/overview/account-views"
import {
  countOpenQuotes,
  listAccountOrders,
  loadAccountContext,
} from "@/features/account/overview/load-account"

export const metadata = { title: "Minha conta — Atelier Bureau" }

/**
 * Loads the summary of the customer area.
 *
 * @returns The overview.
 */
async function Overview() {
  const context = await loadAccountContext()
  if (!context) redirect("/entrar?redirect=%2Fconta")
  const approver = context.links.some((l) => l.href === "/conta/aprovacoes")
  const [orders, awaitingApproval, openQuotes] = await Promise.all([
    listAccountOrders(context, { take: 5 }),
    approver
      ? listAccountOrders(context, { status: "AWAITING_APPROVAL" })
      : Promise.resolve([]),
    countOpenQuotes(context),
  ])
  return (
    <>
      <header>
        <p className="text-caps text-clay uppercase">Minha conta</p>
        <h1 className="text-headline-xl-mobile lg:text-headline-xl">
          Olá, {context.name.split(" ")[0]}
        </h1>
      </header>
      <div className="grid gap-md md:grid-cols-3">
        <SummaryCard
          title="Pedidos recentes"
          value={String(orders.length)}
          href="/conta/pedidos"
        />
        <SummaryCard
          title="Cotações abertas"
          value={String(openQuotes)}
          href="/conta/cotacoes"
        />
        {approver && (
          <SummaryCard
            title="Aguardando sua aprovação"
            value={String(awaitingApproval.length)}
            href="/conta/aprovacoes"
            highlight={awaitingApproval.length > 0}
          />
        )}
      </div>
      <section aria-labelledby="ultimos" className="flex flex-col gap-md">
        <div className="flex items-center justify-between">
          <h2 id="ultimos" className="text-headline-md">
            Últimos pedidos
          </h2>
          <Link
            href="/conta/pedidos"
            className="text-body-sm text-primary underline"
          >
            Ver todos
          </Link>
        </div>
        <AccountOrdersTable
          orders={orders}
          showBuyer={context.seesCompanyOrders}
        />
      </section>
    </>
  )
}

/**
 * Customer area home (#37).
 *
 * @returns The page.
 */
export default function AccountPage() {
  return (
    <Suspense fallback={<p className="text-body">Carregando…</p>}>
      <Overview />
    </Suspense>
  )
}
