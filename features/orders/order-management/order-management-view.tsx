"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { zodResolver } from "@hookform/resolvers/zod"
import { useForm, useWatch } from "react-hook-form"
import { Badge } from "@/components/ui/badge"
import { Button, buttonVariants } from "@/components/ui/button"
import { FormField, fieldAria } from "@/components/ui/form-field"
import { Input } from "@/components/ui/input"
import {
  updateOrderStatus,
  type AdminOrderRow,
} from "@/features/orders/order-management/action/order-management-actions"
import {
  CANCELLATION_REASONS,
  ORDER_STATUS_KEYS,
  updateOrderStatusSchema,
  type UpdateOrderStatusData,
  type UpdateOrderStatusInput,
} from "@/features/orders/order-management/schema/order-management-schema"
import {
  ORDER_STATUS,
  type OrderStatusKey,
} from "@/features/shared/lib/orders/order-status"

const brl = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
})

const scheduledDate = new Intl.DateTimeFormat("pt-BR", {
  weekday: "short",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  timeZone: "America/Sao_Paulo",
})

const dateTime = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "America/Sao_Paulo",
})

/**
 * Badge with the order status label.
 *
 * @param props - Status.
 * @returns The badge.
 */
function StatusBadge({ status }: { status: OrderStatusKey }) {
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
 * Form to move one order to its next status (RF54).
 *
 * @param props - Order and success callback.
 * @returns The form.
 */
function StatusForm({
  order,
  onDone,
}: {
  order: AdminOrderRow
  onDone: (message: string) => void
}) {
  const [error, setError] = useState<string>()
  const [pending, startTransition] = useTransition()
  const form = useForm<UpdateOrderStatusInput, unknown, UpdateOrderStatusData>({
    resolver: zodResolver(updateOrderStatusSchema),
    defaultValues: {
      orderId: order.id,
      to: order.nextStatuses[0],
      note: "",
      trackingCode: "",
      cancellationReason: undefined,
    },
  })
  const errors = form.formState.errors
  const prefix = `status-${order.id}`
  const to = useWatch({ control: form.control, name: "to" })

  const onSubmit = form.handleSubmit(() =>
    startTransition(async () => {
      setError(undefined)
      const values = form.getValues()
      const result = await updateOrderStatus({
        ...values,
        cancellationReason:
          values.to === "CANCELED" ? values.cancellationReason : undefined,
        trackingCode: values.to === "SHIPPED" ? values.trackingCode : "",
      })
      if (!result.success) return setError(result.error)
      onDone(
        `Pedido ${order.number} em "${ORDER_STATUS[result.status].label}".`
      )
    })
  )

  return (
    <form
      onSubmit={onSubmit}
      noValidate
      className="flex flex-col gap-md rounded-lg border border-line-subtle bg-elevated p-md"
    >
      <div className="grid gap-md md:grid-cols-3">
        <FormField
          id={`${prefix}-to`}
          label="Novo status"
          error={errors.to?.message}
        >
          <select
            id={`${prefix}-to`}
            className="h-11 rounded border border-line bg-canvas px-md text-body"
            {...fieldAria(`${prefix}-to`, errors.to?.message)}
            {...form.register("to")}
          >
            {order.nextStatuses.map((status) => (
              <option key={status} value={status}>
                {ORDER_STATUS[status].label}
              </option>
            ))}
          </select>
        </FormField>
        {to === "CANCELED" && (
          <FormField
            id={`${prefix}-reason`}
            label="Motivo do cancelamento"
            error={errors.cancellationReason?.message}
          >
            <select
              id={`${prefix}-reason`}
              className="h-11 rounded border border-line bg-canvas px-md text-body"
              {...fieldAria(
                `${prefix}-reason`,
                errors.cancellationReason?.message
              )}
              {...form.register("cancellationReason")}
            >
              <option value="">Escolha</option>
              {Object.entries(CANCELLATION_REASONS).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </FormField>
        )}
        {to === "SHIPPED" && (
          <FormField
            id={`${prefix}-tracking`}
            label="Código de rastreio (opcional)"
            error={errors.trackingCode?.message}
          >
            <Input
              id={`${prefix}-tracking`}
              autoComplete="off"
              {...fieldAria(`${prefix}-tracking`, errors.trackingCode?.message)}
              {...form.register("trackingCode")}
            />
          </FormField>
        )}
        <FormField
          id={`${prefix}-note`}
          label="Observação (opcional)"
          error={errors.note?.message}
        >
          <Input
            id={`${prefix}-note`}
            {...fieldAria(`${prefix}-note`, errors.note?.message)}
            {...form.register("note")}
          />
        </FormField>
      </div>
      {error && (
        <p role="alert" className="text-body-sm text-error">
          {error}
        </p>
      )}
      <div>
        <Button type="submit" disabled={pending}>
          {pending ? "Salvando…" : "Atualizar status"}
        </Button>
      </div>
    </form>
  )
}

type OrderManagementViewProps = {
  /** Orders to show. */
  orders: AdminOrderRow[]
  /** Current status filter. */
  status: string
  /** Current search text. */
  search: string
}

/**
 * Back office order list (RF54): status, history with date and
 * responsible user, and the status change the user may make.
 *
 * @param props - Orders and filters.
 * @returns The list.
 */
export function OrderManagementView({
  orders,
  status,
  search,
}: OrderManagementViewProps) {
  const router = useRouter()
  const [notice, setNotice] = useState<string>()

  const done = (message: string) => {
    setNotice(message)
    router.refresh()
  }

  return (
    <div className="flex flex-col gap-lg">
      <form
        role="search"
        className="flex flex-wrap items-end gap-sm"
        action="/admin/pedidos"
      >
        <div className="flex min-w-60 flex-1 flex-col gap-xs">
          <label htmlFor="busca-pedido" className="text-label">
            Buscar por número, cliente ou código do Mercado Pago
          </label>
          <Input id="busca-pedido" name="q" defaultValue={search} />
        </div>
        <div className="flex flex-col gap-xs">
          <label htmlFor="status-pedido" className="text-label">
            Status
          </label>
          <select
            id="status-pedido"
            name="status"
            defaultValue={status}
            className="h-11 rounded border border-line bg-canvas px-md text-body"
          >
            <option value="">Todos</option>
            {ORDER_STATUS_KEYS.map((key) => (
              <option key={key} value={key}>
                {ORDER_STATUS[key].label}
              </option>
            ))}
          </select>
        </div>
        <button type="submit" className={buttonVariants({ variant: "ghost" })}>
          Filtrar
        </button>
      </form>

      <div aria-live="polite">
        {notice && <p className="text-body text-ink">{notice}</p>}
      </div>

      {orders.length === 0 ? (
        <p className="text-body text-ink-muted">Nenhum pedido encontrado.</p>
      ) : (
        <ul className="flex flex-col gap-md">
          {orders.map((order) => (
            <li
              key={order.id}
              className="flex flex-col gap-md rounded-lg border border-line-subtle p-md"
            >
              <div className="flex flex-wrap items-center justify-between gap-sm">
                <div className="flex flex-col">
                  <span className="text-subhead">Pedido {order.number}</span>
                  <span className="text-body-sm text-ink-muted">
                    {order.customer}
                    {order.company && ` · ${order.company}`} ·{" "}
                    {dateTime.format(new Date(order.createdAt))}
                  </span>
                  {order.trackingCode && (
                    <span className="text-body-sm text-ink-muted">
                      Rastreio {order.trackingCode}
                    </span>
                  )}
                  {order.scheduledDeliveryAt && (
                    <span className="text-body-sm text-ink">
                      Entrega e instalação agendadas para{" "}
                      {scheduledDate.format(
                        new Date(order.scheduledDeliveryAt)
                      )}
                    </span>
                  )}
                  {order.payment && (
                    <span className="text-body-sm text-ink-muted">
                      {order.payment.method} · {order.payment.status}
                      {order.payment.paymentId &&
                        ` · Mercado Pago ${order.payment.paymentId}`}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-md">
                  <span className="text-body">
                    {brl.format(Number(order.total))}
                  </span>
                  <StatusBadge status={order.status} />
                </div>
              </div>

              <details>
                <summary className="cursor-pointer text-label">
                  Histórico de status ({order.history.length})
                </summary>
                {order.history.length === 0 ? (
                  <p className="pt-sm text-body-sm text-ink-muted">
                    Sem mudanças registradas.
                  </p>
                ) : (
                  <ol className="flex flex-col gap-xs pt-sm text-body-sm">
                    {order.history.map((entry) => (
                      <li key={entry.id}>
                        <time dateTime={entry.at}>
                          {dateTime.format(new Date(entry.at))}
                        </time>{" "}
                        —{" "}
                        {entry.from
                          ? `${ORDER_STATUS[entry.from].label} → `
                          : ""}
                        {ORDER_STATUS[entry.to].label} · {entry.by}
                        {entry.note && ` · ${entry.note}`}
                      </li>
                    ))}
                  </ol>
                )}
              </details>

              {order.nextStatuses.length > 0 && (
                <StatusForm order={order} onDone={done} />
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
