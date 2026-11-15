"use client"

import { useState, useTransition } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { zodResolver } from "@hookform/resolvers/zod"
import { useForm, useWatch } from "react-hook-form"
import { Button, buttonVariants } from "@/components/ui/button"
import { FormField, fieldAria } from "@/components/ui/form-field"
import { Input } from "@/components/ui/input"
import {
  openSupportTicket,
  type TicketForm,
} from "@/features/after-sales/support-tickets/action/support-ticket-actions"
import {
  openTicketSchema,
  type OpenTicketData,
  type OpenTicketInput,
} from "@/features/after-sales/support-tickets/schema/support-ticket-schema"
import { AttachmentPicker } from "@/features/shared/components/attachment-picker"
import {
  TICKET_KIND_LABEL,
  TICKET_KINDS,
} from "@/features/shared/lib/support/ticket-status"

const shortDate = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeZone: "America/Sao_Paulo",
})

/** Classes of the native selects, matching the design system inputs. */
const SELECT_CLASS = "h-11 rounded border border-line bg-canvas px-md text-body"

/**
 * New warranty or technical assistance ticket (RF17): the customer
 * picks the delivered order and the item, the kind of request, writes
 * the problem and attaches photos or documents.
 *
 * @param props - Delivered orders and the preselected order and item.
 * @returns The form, or an empty state.
 */
export function SupportTicketFormView({ form: initial }: { form: TicketForm }) {
  const router = useRouter()
  const [files, setFiles] = useState<File[]>([])
  const [error, setError] = useState<string>()
  const [pending, startTransition] = useTransition()
  const firstOrder = initial.orders[0]
  const form = useForm<OpenTicketInput, unknown, OpenTicketData>({
    resolver: zodResolver(openTicketSchema),
    defaultValues: {
      orderId: initial.orderId ?? firstOrder?.orderId ?? "",
      orderItemId:
        initial.orderItemId ??
        (initial.orderId ? "" : (firstOrder?.items[0]?.id ?? "")),
      kind: "WARRANTY",
      subject: "",
      description: "",
    },
  })
  const orderId = useWatch({ control: form.control, name: "orderId" })
  const order = initial.orders.find((row) => row.orderId === orderId)
  const errors = form.formState.errors

  if (initial.orders.length === 0) {
    return (
      <div className="flex flex-col items-start gap-md rounded-lg bg-subtle p-lg">
        <p className="text-body text-ink-muted">
          O chamado de garantia ou assistência técnica é aberto para produtos de
          pedidos já entregues. Quando o seu pedido chegar, volte aqui.
        </p>
        <Link href="/conta/pedidos" className={buttonVariants()}>
          Ver meus pedidos
        </Link>
      </div>
    )
  }

  const onSubmit = form.handleSubmit((values) =>
    startTransition(async () => {
      setError(undefined)
      const data = new FormData()
      data.set("payload", JSON.stringify(values))
      for (const file of files) data.append("attachments", file)
      const result = await openSupportTicket(data)
      if (!result.success) return setError(result.error)
      router.push(`/conta/chamados/${result.ticketId}?novo=1`)
    })
  )

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-lg">
      <section aria-labelledby="produto" className="flex flex-col gap-md">
        <h2 id="produto" className="text-headline-md">
          Produto
        </h2>
        <div className="grid gap-md md:grid-cols-2">
          <FormField
            id="ticket-order"
            label="Pedido"
            error={errors.orderId?.message}
          >
            <select
              id="ticket-order"
              className={SELECT_CLASS}
              {...fieldAria("ticket-order", errors.orderId?.message)}
              {...form.register("orderId", {
                onChange: (event: { target: { value: string } }) => {
                  const next = initial.orders.find(
                    (row) => row.orderId === event.target.value
                  )
                  form.setValue("orderItemId", next?.items[0]?.id ?? "")
                },
              })}
            >
              {initial.orders.map((row) => (
                <option key={row.orderId} value={row.orderId}>
                  {row.number}
                  {row.deliveredAt
                    ? ` · entregue em ${shortDate.format(new Date(row.deliveredAt))}`
                    : ""}
                </option>
              ))}
            </select>
          </FormField>
          <FormField
            id="ticket-item"
            label="Item do pedido"
            error={errors.orderItemId?.message}
          >
            <select
              id="ticket-item"
              className={SELECT_CLASS}
              {...fieldAria("ticket-item", errors.orderItemId?.message)}
              {...form.register("orderItemId")}
            >
              <option value="">Escolha o produto</option>
              {order?.items.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name} ({item.quantity}{" "}
                  {item.quantity === 1 ? "unidade" : "unidades"})
                </option>
              ))}
            </select>
          </FormField>
        </div>
      </section>

      <section aria-labelledby="problema" className="flex flex-col gap-md">
        <h2 id="problema" className="text-headline-md">
          Problema
        </h2>
        <fieldset className="flex flex-col gap-sm">
          <legend className="text-label">Tipo de chamado</legend>
          <div className="flex flex-wrap gap-md">
            {TICKET_KINDS.map((kind) => (
              <label
                key={kind}
                className="flex items-center gap-sm text-body text-ink"
              >
                <input
                  type="radio"
                  value={kind}
                  className="size-4 accent-primary"
                  {...form.register("kind")}
                />
                {TICKET_KIND_LABEL[kind]}
              </label>
            ))}
          </div>
          {errors.kind?.message && (
            <p role="alert" className="text-body-sm text-error">
              {errors.kind.message}
            </p>
          )}
        </fieldset>
        <FormField
          id="ticket-subject"
          label="Resumo"
          error={errors.subject?.message}
        >
          <Input
            id="ticket-subject"
            {...fieldAria("ticket-subject", errors.subject?.message)}
            {...form.register("subject")}
          />
        </FormField>
        <FormField
          id="ticket-description"
          label="Descreva o problema"
          error={errors.description?.message}
          hint="Quando começou, como o produto é usado e o que já foi tentado. A avaliação técnica confere as condições da garantia."
        >
          <textarea
            id="ticket-description"
            rows={6}
            className="rounded border border-line bg-canvas p-md text-body"
            {...fieldAria("ticket-description", errors.description?.message)}
            {...form.register("description")}
          />
        </FormField>
        <AttachmentPicker
          id="ticket-files"
          label="Fotos ou documentos do problema (recomendado)"
          files={files}
          onChange={setFiles}
        />
      </section>

      {error && (
        <p role="alert" className="text-body-sm text-error">
          {error}
        </p>
      )}
      <Button type="submit" size="lg" className="self-start" disabled={pending}>
        {pending ? "Enviando…" : "Abrir chamado"}
      </Button>
    </form>
  )
}
