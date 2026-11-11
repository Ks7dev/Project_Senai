import Link from "next/link"
import { Badge } from "@/components/ui/badge"
import { buttonVariants } from "@/components/ui/button"
import type {
  AccountContext,
  AccountOrder,
} from "@/features/account/overview/load-account"
import {
  ORDER_STATUS,
  type OrderStatusKey,
} from "@/features/shared/lib/orders/order-status"
import { cn } from "@/lib/utils"

const brl = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
})

/**
 * Badge with the customer-facing order status (RF15).
 *
 * @param props - Order status.
 * @returns The badge.
 */
export function OrderStatusBadge({ status }: { status: OrderStatusKey }) {
  const { label, tone } = ORDER_STATUS[status]
  return (
    <Badge
      variant={
        tone === "problem"
          ? "destructive"
          : tone === "done"
            ? "default"
            : "outline"
      }
    >
      {label}
    </Badge>
  )
}

/**
 * Account side menu with the sections allowed for the profile (#37).
 *
 * @param props - Account context and the current path.
 * @returns The navigation.
 */
export function AccountNav({ context }: { context: AccountContext }) {
  return (
    <nav aria-label="Minha conta" className="flex flex-col gap-sm">
      <div className="pb-sm">
        <p className="text-subhead text-ink">{context.name}</p>
        {context.organizationName && (
          <p className="text-body-sm text-ink-muted">
            {context.organizationName}
            {context.roleLabels.length > 0 &&
              ` · ${context.roleLabels.join(", ")}`}
          </p>
        )}
      </div>
      <ul className="flex flex-row flex-wrap gap-xs lg:flex-col">
        {context.links.map((link) => (
          <li key={link.href}>
            <Link
              href={link.href}
              className="block rounded px-sm py-2 text-label text-ink hover:bg-primary-tint"
            >
              {link.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  )
}

/**
 * Orders table of the customer area: number, date, buyer, status and
 * total (RF15).
 *
 * @param props - Orders and whether to show the buyer column.
 * @returns The table, or an empty state.
 */
export function AccountOrdersTable({
  orders,
  showBuyer,
}: {
  orders: AccountOrder[]
  showBuyer: boolean
}) {
  if (orders.length === 0) {
    return (
      <div className="flex flex-col items-start gap-sm rounded-lg bg-subtle p-lg">
        <p className="text-body text-ink-muted">
          Nenhum pedido por aqui ainda.
        </p>
        <Link
          href="/"
          className={buttonVariants({ variant: "ghost", size: "sm" })}
        >
          Explorar a loja
        </Link>
      </div>
    )
  }
  return (
    <div className="overflow-x-auto rounded-lg border border-line-subtle">
      <table className="w-full min-w-[560px] text-left text-body-sm">
        <caption className="sr-only">Pedidos</caption>
        <thead className="bg-subtle text-label">
          <tr>
            <th scope="col" className="p-sm">
              Pedido
            </th>
            <th scope="col" className="p-sm">
              Data
            </th>
            {showBuyer && (
              <th scope="col" className="p-sm">
                Solicitante
              </th>
            )}
            <th scope="col" className="p-sm">
              Status
            </th>
            <th scope="col" className="p-sm text-right">
              Total
            </th>
          </tr>
        </thead>
        <tbody>
          {orders.map((order) => (
            <tr key={order.id} className="border-t border-line-subtle">
              <td className="p-sm">
                <Link
                  href={`/conta/pedidos/${order.id}`}
                  className="text-primary underline"
                >
                  {order.number}
                </Link>
                {order.addressChangeable && (
                  <Link
                    href={`/conta/pedidos/${order.id}/endereco`}
                    className="block text-label-sm text-ink-muted underline hover:text-ink"
                  >
                    Alterar endereço
                  </Link>
                )}
              </td>
              <td className="p-sm">
                {new Date(order.createdAt).toLocaleDateString("pt-BR")}
              </td>
              {showBuyer && <td className="p-sm">{order.buyer}</td>}
              <td className="p-sm">
                <OrderStatusBadge status={order.status} />
              </td>
              <td className="p-sm text-right">
                {brl.format(Number(order.total))}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/**
 * Summary card of the customer area home.
 *
 * @param props - Title, value, link and optional emphasis.
 * @returns The card.
 */
export function SummaryCard({
  title,
  value,
  href,
  highlight = false,
}: {
  title: string
  value: string
  href: string
  highlight?: boolean
}) {
  return (
    <Link
      href={href}
      className={cn(
        "flex flex-col gap-xs rounded-lg border p-md hover:shadow-1",
        highlight
          ? "border-primary bg-primary-tint"
          : "border-line-subtle bg-elevated"
      )}
    >
      <span className="text-caps text-clay uppercase">{title}</span>
      <span className="text-headline-md text-ink">{value}</span>
    </Link>
  )
}
