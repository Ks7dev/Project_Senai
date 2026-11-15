"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { zodResolver } from "@hookform/resolvers/zod"
import { useForm } from "react-hook-form"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { FormField, fieldAria } from "@/components/ui/form-field"
import { Input } from "@/components/ui/input"
import { ORDER_STATUS } from "@/features/shared/lib/orders/order-status"
import { QUOTED_METHODS } from "@/features/shared/lib/shipping/quoted-methods"
import { manualQuoteReasonMessage } from "@/features/shared/lib/shipping/shipping-messages"
import {
  answerManualShippingQuote,
  type ManualQuoteRow,
} from "@/features/shipping/manual-quotes/action/manual-quote-actions"
import {
  answerManualQuoteSchema,
  type AnswerManualQuoteData,
  type AnswerManualQuoteInput,
} from "@/features/shipping/manual-quotes/schema/manual-quote-schema"

const brl = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
})

const dateTime = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "America/Sao_Paulo",
})

/**
 * Form to quote the shipping of one order.
 *
 * @param props - Order, cancel callback and success callback.
 * @returns The form.
 */
function AnswerForm({
  order,
  onCancel,
  onDone,
}: {
  order: ManualQuoteRow
  onCancel: () => void
  onDone: (message: string) => void
}) {
  const [error, setError] = useState<string>()
  const [pending, startTransition] = useTransition()
  const form = useForm<AnswerManualQuoteInput, unknown, AnswerManualQuoteData>({
    resolver: zodResolver(answerManualQuoteSchema),
    defaultValues: {
      orderId: order.id,
      method: order.items.some((item) => item.requiresAssembly)
        ? "OWN_DELIVERY"
        : "CARRIER",
      carrier: "",
      service: "",
      price: "",
      deliveryDays: "",
      note: "",
    },
  })
  const errors = form.formState.errors
  const prefix = `quote-${order.id}`

  const onSubmit = form.handleSubmit(() =>
    startTransition(async () => {
      setError(undefined)
      const result = await answerManualShippingQuote(form.getValues())
      if (!result.success) return setError(result.error)
      onDone(
        `Frete do pedido ${order.number} cotado. Pedido em "${ORDER_STATUS[result.status].label}".`
      )
    })
  )

  const text = (
    name: "carrier" | "service" | "price" | "deliveryDays" | "note",
    label: string,
    options: { hint?: string; inputMode?: "decimal" | "numeric" } = {}
  ) => {
    const message = errors[name]?.message
    return (
      <FormField
        id={`${prefix}-${name}`}
        label={label}
        error={message}
        hint={options.hint}
      >
        <Input
          id={`${prefix}-${name}`}
          inputMode={options.inputMode}
          {...fieldAria(`${prefix}-${name}`, message)}
          {...form.register(name)}
        />
      </FormField>
    )
  }

  return (
    <form
      onSubmit={onSubmit}
      noValidate
      className="flex flex-col gap-md rounded-lg border border-line-subtle bg-elevated p-md"
    >
      <div className="grid gap-md md:grid-cols-3">
        <FormField
          id={`${prefix}-method`}
          label="Modalidade"
          error={errors.method?.message}
        >
          <select
            id={`${prefix}-method`}
            className="h-11 rounded border border-line bg-canvas px-md text-body"
            {...fieldAria(`${prefix}-method`, errors.method?.message)}
            {...form.register("method")}
          >
            {Object.entries(QUOTED_METHODS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </FormField>
        {text("carrier", "Quem entrega", {
          hint: "Ex.: Atelier Bureau ou o nome da transportadora.",
        })}
        {text("service", "Serviço")}
        {text("price", "Valor do frete (R$)", { inputMode: "decimal" })}
        {text("deliveryDays", "Prazo (dias úteis)", {
          inputMode: "numeric",
          hint: "Em branco quando a data é agendada com o cliente.",
        })}
        {text("note", "Observação interna")}
      </div>
      {error && (
        <p role="alert" className="text-body-sm text-error">
          {error}
        </p>
      )}
      <div className="flex flex-wrap gap-sm">
        <Button type="submit" disabled={pending}>
          Enviar cotação ao cliente
        </Button>
        <Button
          type="button"
          variant="ghost"
          disabled={pending}
          onClick={onCancel}
        >
          Cancelar
        </Button>
      </div>
    </form>
  )
}

/**
 * Sales queue of orders without a calculable shipping (#44, RN16,
 * RN20): deadline promised to the customer, destination, products with
 * weight and dimensions, and the form to send the quoted shipping.
 *
 * @param props - Orders waiting and whether the user may answer.
 * @returns The queue.
 */
export function ManualQuotesView({
  orders,
  canAnswer,
}: {
  orders: ManualQuoteRow[]
  canAnswer: boolean
}) {
  const router = useRouter()
  const [answering, setAnswering] = useState<string | null>(null)
  const [message, setMessage] = useState<string>()

  return (
    <div className="flex flex-col gap-lg">
      {message && (
        <p role="status" className="text-body-sm text-primary">
          {message}
        </p>
      )}
      {orders.length === 0 ? (
        <p className="text-body text-ink-muted">
          Nenhum pedido aguardando cotação de frete.
        </p>
      ) : (
        <ul className="flex flex-col gap-md">
          {orders.map((order) => (
            <li
              key={order.id}
              className="flex flex-col gap-sm rounded-lg border border-line-subtle p-md"
            >
              <div className="flex flex-wrap items-center gap-sm">
                <h2 className="flex-1 text-headline-sm">
                  Pedido {order.number}
                </h2>
                {order.overdue ? (
                  <Badge variant="destructive">Prazo vencido</Badge>
                ) : (
                  <Badge variant="outline">No prazo</Badge>
                )}
              </div>
              <p className="text-body-sm text-ink-muted">
                {order.company ? `${order.company} · ` : ""}
                {order.customer} · {order.destination} · pedido em{" "}
                {dateTime.format(new Date(order.createdAt))}
                {order.respondBy &&
                  ` · responder até ${dateTime.format(new Date(order.respondBy))}`}
              </p>
              {order.reason && (
                <p className="text-body-sm">
                  {manualQuoteReasonMessage(
                    order.reason === "assembly_outside_coverage"
                      ? "assembly_outside_coverage"
                      : "no_option"
                  )}
                </p>
              )}
              <table className="w-full text-left text-body-sm">
                <caption className="sr-only">
                  Produtos do pedido {order.number}
                </caption>
                <thead className="text-ink-muted">
                  <tr>
                    <th scope="col" className="py-1 pr-sm font-normal">
                      Produto
                    </th>
                    <th scope="col" className="py-1 pr-sm font-normal">
                      Qtd.
                    </th>
                    <th scope="col" className="py-1 pr-sm font-normal">
                      Peso unit.
                    </th>
                    <th scope="col" className="py-1 font-normal">
                      Embalagem
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {order.items.map((item) => (
                    <tr
                      key={item.skuCode}
                      className="border-t border-line-subtle"
                    >
                      <td className="py-1 pr-sm">
                        {item.productName}
                        <span className="block text-ink-muted">
                          {item.skuCode}
                          {item.requiresAssembly && " · com montagem"}
                        </span>
                      </td>
                      <td className="py-1 pr-sm">{item.quantity}</td>
                      <td className="py-1 pr-sm">
                        {item.weightKg.replace(".", ",")} kg
                      </td>
                      <td className="py-1">{item.dimensions}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="text-body-sm">
                Subtotal dos produtos: {brl.format(Number(order.subtotal))}
              </p>
              {canAnswer &&
                (answering === order.id ? (
                  <AnswerForm
                    order={order}
                    onCancel={() => setAnswering(null)}
                    onDone={(text) => {
                      setAnswering(null)
                      setMessage(text)
                      router.refresh()
                    }}
                  />
                ) : (
                  <Button
                    className="self-start"
                    onClick={() => {
                      setMessage(undefined)
                      setAnswering(order.id)
                    }}
                  >
                    Cotar frete
                  </Button>
                ))}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
