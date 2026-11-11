import { Suspense } from "react"
import { listAdminOrders } from "@/features/orders/order-management/action/order-management-actions"
import {
  ORDER_STATUS_KEYS,
  type OrderFiltersInput,
} from "@/features/orders/order-management/schema/order-management-schema"
import { OrderManagementView } from "@/features/orders/order-management/order-management-view"
import { requirePagePermission } from "@/features/shared/lib/db/page-guard"

type Search = { q?: string; status?: string }

/**
 * Loads the orders after checking the permission.
 *
 * @param props - Search params promise.
 * @returns The list or the error message.
 */
async function OrdersSection({
  searchParams,
}: {
  searchParams: Promise<Search>
}) {
  await requirePagePermission("order:read", "/admin/pedidos")
  const params = await searchParams
  const search = typeof params.q === "string" ? params.q : ""
  const status = (ORDER_STATUS_KEYS as readonly string[]).includes(
    params.status ?? ""
  )
    ? (params.status as OrderFiltersInput["status"])
    : undefined
  const result = await listAdminOrders({ search, status })
  if (!result.success) {
    return (
      <p role="alert" className="text-body text-error">
        {result.error}
      </p>
    )
  }
  return (
    <OrderManagementView
      orders={result.orders}
      status={status ?? ""}
      search={search}
    />
  )
}

/**
 * Back office orders route (#65, RF54).
 *
 * @param props - Page props with the search params.
 * @returns The page.
 */
export default function AdminOrdersPage(props: PageProps<"/admin/pedidos">) {
  return (
    <div className="flex flex-col gap-lg">
      <header>
        <p className="text-caps text-clay uppercase">Pedidos</p>
        <h1 className="text-headline-xl-mobile lg:text-headline-xl">Pedidos</h1>
      </header>
      <Suspense fallback={<p className="text-body">Carregando pedidos…</p>}>
        <OrdersSection searchParams={props.searchParams as Promise<Search>} />
      </Suspense>
    </div>
  )
}
