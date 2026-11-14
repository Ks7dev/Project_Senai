import { Suspense } from "react"
import Link from "next/link"
import {
  findRefundOrder,
  listRefunds,
  type RefundOrderSummary,
} from "@/features/finance/refunds/action/refund-actions"
import { RefundsView } from "@/features/finance/refunds/refunds-view"
import {
  REFUND_FILTERS,
  type RefundFilter,
} from "@/features/finance/refunds/schema/refund-schema"
import { requirePagePermission } from "@/features/shared/lib/db/page-guard"

export const metadata = { title: "Estornos — Atelier Bureau" }

type Search = { filtro?: string; pedido?: string }

/**
 * Loads the refunds and the order searched after checking the
 * permission.
 *
 * @param props - Search params promise.
 * @returns The refunds or the error message.
 */
async function RefundsSection({
  searchParams,
}: {
  searchParams: Promise<Search>
}) {
  await requirePagePermission("payment:refund", "/admin/financeiro/estornos")
  const params = await searchParams
  const filter: RefundFilter = (REFUND_FILTERS as readonly string[]).includes(
    params.filtro ?? ""
  )
    ? (params.filtro as RefundFilter)
    : "ALL"
  const orderNumber =
    typeof params.pedido === "string" ? params.pedido.trim().slice(0, 20) : ""

  const [list, lookup] = await Promise.all([
    listRefunds({ filter }),
    orderNumber ? findRefundOrder({ number: orderNumber }) : null,
  ])
  if (!list.success) {
    return (
      <p role="alert" className="text-body text-error">
        {list.error}
      </p>
    )
  }
  let order: RefundOrderSummary | null = null
  let lookupError: string | null = null
  if (lookup) {
    if (lookup.success) order = lookup.order
    else lookupError = lookup.error
  }
  return (
    <RefundsView
      data={list.refunds}
      filter={filter}
      orderNumber={orderNumber}
      order={order}
      lookupError={lookupError}
    />
  )
}

/**
 * Back office route of the refunds (#59, RF34).
 *
 * @param props - Page props with the search params.
 * @returns The page.
 */
export default function AdminRefundsPage(
  props: PageProps<"/admin/financeiro/estornos">
) {
  return (
    <div className="flex flex-col gap-lg">
      <header className="flex flex-col gap-xs">
        <Link
          href="/admin/financeiro"
          className="text-body-sm text-primary underline"
        >
          Financeiro
        </Link>
        <h1 className="text-headline-xl-mobile lg:text-headline-xl">
          Estornos
        </h1>
      </header>
      <Suspense fallback={<p className="text-body">Carregando estornos…</p>}>
        <RefundsSection searchParams={props.searchParams as Promise<Search>} />
      </Suspense>
    </div>
  )
}
