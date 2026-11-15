"use client"

import { useState, useTransition } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { zodResolver } from "@hookform/resolvers/zod"
import { DownloadIcon } from "lucide-react"
import { useForm, useWatch } from "react-hook-form"
import { Button } from "@/components/ui/button"
import { FormField, fieldAria } from "@/components/ui/form-field"
import { Input } from "@/components/ui/input"
import {
  answerQuote,
  convertQuoteToOrder,
  downloadAdminQuoteAttachment,
  revalidateQuote,
  startQuoteReview,
  type AdminQuote,
} from "@/features/cart/quote-management/action/quote-management-actions"
import {
  answerQuoteSchema,
  CONVERSION_PAYMENT_METHODS,
  convertQuoteSchema,
  type AnswerQuoteData,
  type AnswerQuoteInput,
  type ConvertQuoteData,
  type ConvertQuoteInput,
} from "@/features/cart/quote-management/schema/quote-management-schema"
import { QuoteStatusBadge } from "@/features/shared/components/quote-status-badge"
import { ORDER_STATUS } from "@/features/shared/lib/orders/order-status"
import { PAYMENT_METHOD_LABEL } from "@/features/shared/lib/payments/payment-messages"
import { formatFileSize } from "@/features/shared/lib/quotes/quote-attachments"
import { saveDownloadedFile } from "@/features/shared/lib/quotes/save-download"
import { QUOTED_METHODS } from "@/features/shared/lib/shipping/quoted-methods"

const brl = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
})

const dateTime = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "America/Sao_Paulo",
})

const selectClass = "h-11 rounded border border-line bg-canvas px-md text-body"

/**
 * Formats a decimal string as BRL, or a dash.
 *
 * @param value - Decimal string or null.
 * @returns The formatted value.
 */
function money(value: string | null): string {
  return value === null ? "—" : brl.format(Number(value))
}

/**
 * Reads a money value being typed ("1234,56" or "1234.56") as cents,
 * only to preview the total; the server calculates the real one.
 *
 * @param value - Typed value.
 * @returns Cents, or 0 when it is not a number yet.
 */
function typedCents(value: string | undefined): number {
  const number = Number((value ?? "").trim().replace(",", "."))
  return Number.isFinite(number) ? Math.round(number * 100) : 0
}

/**
 * Form where the sales team answers a quote with the negotiated unit
 * prices, discount and shipping (RF20).
 *
 * @param props - Quote, whether it is a new proposal and the success callback.
 * @returns The form.
 */
function AnswerForm({
  quote,
  onDone,
}: {
  quote: AdminQuote
  onDone: (message: string) => void
}) {
  const [error, setError] = useState<string>()
  const [pending, startTransition] = useTransition()
  const answered = quote.status === "ANSWERED"
  const form = useForm<AnswerQuoteInput, unknown, AnswerQuoteData>({
    resolver: zodResolver(answerQuoteSchema),
    defaultValues: {
      quoteId: quote.id,
      lines: quote.items.map((item) => ({
        itemId: item.id,
        unitPrice: (item.unitPrice ?? item.catalogPrice ?? "").replace(
          ".",
          ","
        ),
      })),
      discount: quote.discount.replace(".", ","),
      shippingTotal: quote.shippingTotal.replace(".", ","),
      note: quote.answerNote ?? "",
    },
  })
  const errors = form.formState.errors
  const values = useWatch({ control: form.control })
  const subtotal = quote.items.reduce(
    (sum, item, index) =>
      sum + typedCents(values.lines?.[index]?.unitPrice) * item.quantity,
    0
  )
  const total =
    subtotal - typedCents(values.discount) + typedCents(values.shippingTotal)

  const onSubmit = form.handleSubmit(() =>
    startTransition(async () => {
      setError(undefined)
      const result = await answerQuote(form.getValues())
      if (!result.success) return setError(result.error)
      onDone(
        `Proposta enviada ao cliente. Total ${money(result.total)}, válida até ${dateTime.format(new Date(result.validUntil))}.`
      )
    })
  )

  return (
    <form
      onSubmit={onSubmit}
      noValidate
      aria-labelledby="responder-cotacao"
      className="flex flex-col gap-md rounded-lg border border-line-subtle bg-elevated p-md"
    >
      <h2 id="responder-cotacao" className="text-headline-sm">
        {answered ? "Enviar nova proposta" : "Responder a cotação"}
      </h2>
      <p className="text-body-sm text-ink-muted">
        Informe o preço unitário negociado de cada item, o desconto e o frete. O
        pedido gerado depois mantém exatamente estes valores.
      </p>
      <div className="grid gap-md md:grid-cols-2">
        {quote.items.map((item, index) => {
          const id = `answer-line-${item.id}`
          const message = errors.lines?.[index]?.unitPrice?.message
          return (
            <FormField
              key={item.id}
              id={id}
              label={`${item.description} — ${item.quantity} un. (R$ por unidade)`}
              error={message}
              hint={
                item.catalogPrice
                  ? `Preço de catálogo hoje: ${money(item.catalogPrice)}.`
                  : "Item fora do catálogo: não poderá virar pedido."
              }
            >
              <Input
                id={id}
                inputMode="decimal"
                {...fieldAria(id, message)}
                {...form.register(`lines.${index}.unitPrice`)}
              />
            </FormField>
          )
        })}
      </div>
      <div className="grid gap-md md:grid-cols-2">
        <FormField
          id="answer-discount"
          label="Desconto (R$)"
          error={errors.discount?.message}
        >
          <Input
            id="answer-discount"
            inputMode="decimal"
            {...fieldAria("answer-discount", errors.discount?.message)}
            {...form.register("discount")}
          />
        </FormField>
        <FormField
          id="answer-shipping"
          label="Frete (R$)"
          error={errors.shippingTotal?.message}
        >
          <Input
            id="answer-shipping"
            inputMode="decimal"
            {...fieldAria("answer-shipping", errors.shippingTotal?.message)}
            {...form.register("shippingTotal")}
          />
        </FormField>
      </div>
      <FormField
        id="answer-note"
        label="Mensagem ao cliente (opcional)"
        error={errors.note?.message}
        hint="Condições, prazos e o que foi combinado. O cliente lê na página da cotação."
      >
        <textarea
          id="answer-note"
          rows={4}
          className="rounded border border-line bg-canvas p-md text-body"
          {...fieldAria("answer-note", errors.note?.message)}
          {...form.register("note")}
        />
      </FormField>
      <p className="text-body-sm" aria-live="polite">
        Subtotal {brl.format(subtotal / 100)} · Total da proposta{" "}
        <strong>{brl.format(total / 100)}</strong>
      </p>
      {errors.lines?.message && (
        <p role="alert" className="text-body-sm text-error">
          {errors.lines.message}
        </p>
      )}
      {error && (
        <p role="alert" className="text-body-sm text-error">
          {error}
        </p>
      )}
      <div>
        <Button type="submit" disabled={pending}>
          {pending ? "Enviando…" : "Enviar proposta ao cliente"}
        </Button>
      </div>
    </form>
  )
}

/**
 * Form where the sales team turns an accepted quote into an order
 * (RF20): delivery address, payment and shipping. The values are those
 * of the quote and cannot be edited here.
 *
 * @param props - Quote and success callback.
 * @returns The form.
 */
function ConvertForm({
  quote,
  onDone,
}: {
  quote: AdminQuote
  onDone: (message: string) => void
}) {
  const [error, setError] = useState<string>()
  const [pending, startTransition] = useTransition()
  const needsInstallation = quote.items.some(
    (item) => item.requiresInstallation
  )
  const form = useForm<ConvertQuoteInput, unknown, ConvertQuoteData>({
    resolver: zodResolver(convertQuoteSchema),
    defaultValues: {
      quoteId: quote.id,
      addressId: quote.addresses[0]?.id ?? "",
      paymentMethod: "PIX",
      shippingMethod: needsInstallation ? "OWN_DELIVERY" : "CARRIER",
      carrier: "",
      deliveryDays: "",
      installationDate: "",
    },
  })
  const errors = form.formState.errors

  const onSubmit = form.handleSubmit(() =>
    startTransition(async () => {
      setError(undefined)
      const result = await convertQuoteToOrder(form.getValues())
      if (!result.success) return setError(result.error)
      onDone(
        `Pedido ${result.order.number} gerado com total de ${money(result.order.total)}, em "${ORDER_STATUS[result.order.status].label}".`
      )
    })
  )

  if (quote.addresses.length === 0) {
    return (
      <p role="status" className="rounded bg-subtle p-md text-body-sm">
        O cliente ainda não tem endereço de entrega cadastrado. Peça que
        cadastre um em Minha conta &gt; Endereços para gerar o pedido.
      </p>
    )
  }

  return (
    <form
      onSubmit={onSubmit}
      noValidate
      aria-labelledby="converter-cotacao"
      className="flex flex-col gap-md rounded-lg border border-line-subtle bg-elevated p-md"
    >
      <h2 id="converter-cotacao" className="text-headline-sm">
        Converter em pedido
      </h2>
      <p className="text-body-sm text-ink-muted">
        O pedido é criado com os valores negociados nesta cotação: total de{" "}
        {money(quote.total)}, com frete de {money(quote.shippingTotal)} e
        desconto de {money(quote.discount)}. O estoque é reservado na conversão.
      </p>
      <div className="grid gap-md md:grid-cols-2">
        <FormField
          id="convert-address"
          label="Endereço de entrega"
          error={errors.addressId?.message}
          className="md:col-span-2"
        >
          <select
            id="convert-address"
            className={selectClass}
            {...fieldAria("convert-address", errors.addressId?.message)}
            {...form.register("addressId")}
          >
            {quote.addresses.map((address) => (
              <option key={address.id} value={address.id}>
                {address.label} — {address.line}
              </option>
            ))}
          </select>
        </FormField>
        <FormField
          id="convert-payment"
          label="Forma de pagamento"
          error={errors.paymentMethod?.message}
        >
          <select
            id="convert-payment"
            className={selectClass}
            {...fieldAria("convert-payment", errors.paymentMethod?.message)}
            {...form.register("paymentMethod")}
          >
            {CONVERSION_PAYMENT_METHODS.map((method) => (
              <option key={method} value={method}>
                {PAYMENT_METHOD_LABEL[method]}
              </option>
            ))}
          </select>
        </FormField>
        <FormField
          id="convert-shipping"
          label="Modalidade de frete"
          error={errors.shippingMethod?.message}
        >
          <select
            id="convert-shipping"
            className={selectClass}
            {...fieldAria("convert-shipping", errors.shippingMethod?.message)}
            {...form.register("shippingMethod")}
          >
            {Object.entries(QUOTED_METHODS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </FormField>
        <FormField
          id="convert-carrier"
          label="Quem entrega (opcional)"
          error={errors.carrier?.message}
          hint="Ex.: Atelier Bureau ou o nome da transportadora."
        >
          <Input
            id="convert-carrier"
            {...fieldAria("convert-carrier", errors.carrier?.message)}
            {...form.register("carrier")}
          />
        </FormField>
        <FormField
          id="convert-days"
          label="Prazo de entrega (dias úteis, opcional)"
          error={errors.deliveryDays?.message}
        >
          <Input
            id="convert-days"
            inputMode="numeric"
            {...fieldAria("convert-days", errors.deliveryDays?.message)}
            {...form.register("deliveryDays")}
          />
        </FormField>
        {needsInstallation && (
          <FormField
            id="convert-installation"
            label="Data de entrega e instalação"
            error={errors.installationDate?.message}
            hint="Combinada com o cliente. Há itens que exigem instalação."
          >
            <Input
              id="convert-installation"
              type="date"
              {...fieldAria(
                "convert-installation",
                errors.installationDate?.message
              )}
              {...form.register("installationDate")}
            />
          </FormField>
        )}
      </div>
      {error && (
        <p role="alert" className="text-body-sm text-error">
          {error}
        </p>
      )}
      <div>
        <Button type="submit" disabled={pending}>
          {pending ? "Gerando pedido…" : "Gerar pedido"}
        </Button>
      </div>
    </form>
  )
}

/**
 * Quote page of the back office (#50, RF20): the request of the
 * customer with its attachments, the lines and totals, and what the
 * sales team may do in the current status: take it for analysis,
 * answer with the negotiated values, revalidate an expired one (RN02)
 * and convert the accepted one into an order.
 *
 * @param props - Quote and whether the user may answer and convert.
 * @returns The quote content.
 */
export function QuoteDeskView({
  quote,
  canAnswer,
}: {
  quote: AdminQuote
  canAnswer: boolean
}) {
  const router = useRouter()
  const [notice, setNotice] = useState<string>()
  const [error, setError] = useState<string>()
  const [pending, startTransition] = useTransition()

  const done = (message: string) => {
    setNotice(message)
    setError(undefined)
    router.refresh()
  }

  const run = (
    action: () => Promise<
      { success: true } | { success: false; error: string }
    >,
    message: string
  ) =>
    startTransition(async () => {
      setError(undefined)
      const result = await action()
      if (!result.success) return setError(result.error)
      done(message)
    })

  const download = (attachmentId: string) =>
    startTransition(async () => {
      setError(undefined)
      const result = await downloadAdminQuoteAttachment({ attachmentId })
      if (!result.success) return setError(result.error)
      saveDownloadedFile(result.file)
    })

  const answerable =
    quote.status === "REQUESTED" ||
    quote.status === "IN_REVIEW" ||
    quote.status === "ANSWERED"

  return (
    <div className="flex flex-col gap-lg">
      <div aria-live="polite">
        {notice && (
          <p className="rounded bg-primary-tint p-sm text-body-sm">{notice}</p>
        )}
      </div>
      {error && (
        <p role="alert" className="text-body-sm text-error">
          {error}
        </p>
      )}

      <dl className="grid gap-md text-body-sm lg:grid-cols-4 sm:grid-cols-2">
        <div>
          <dt className="text-ink-muted">Status</dt>
          <dd>
            <QuoteStatusBadge status={quote.status} />
          </dd>
        </div>
        <div>
          <dt className="text-ink-muted">Cliente</dt>
          <dd>
            {quote.customer}
            {quote.company && ` · ${quote.company}`}
            <span className="block text-ink-muted">{quote.customerEmail}</span>
          </dd>
        </div>
        <div>
          <dt className="text-ink-muted">Solicitada em</dt>
          <dd>{dateTime.format(new Date(quote.createdAt))}</dd>
        </div>
        <div>
          <dt className="text-ink-muted">Válida até</dt>
          <dd>
            {quote.validUntil
              ? dateTime.format(new Date(quote.validUntil))
              : "—"}
          </dd>
        </div>
      </dl>

      {quote.notes && (
        <section
          aria-labelledby="pedido-cliente"
          className="flex flex-col gap-xs"
        >
          <h2 id="pedido-cliente" className="text-headline-sm">
            Observações do cliente
          </h2>
          <p className="text-body-sm whitespace-pre-line">{quote.notes}</p>
        </section>
      )}

      <section aria-labelledby="itens-cotacao" className="flex flex-col gap-sm">
        <h2 id="itens-cotacao" className="text-headline-sm">
          Itens
        </h2>
        <div className="overflow-x-auto rounded-lg border border-line-subtle">
          <table className="w-full min-w-[640px] text-left text-body-sm">
            <caption className="sr-only">
              Itens da cotação {quote.number}
            </caption>
            <thead className="bg-subtle text-label">
              <tr>
                <th scope="col" className="p-sm">
                  Produto
                </th>
                <th scope="col" className="p-sm">
                  SKU
                </th>
                <th scope="col" className="p-sm">
                  Qtd.
                </th>
                <th scope="col" className="p-sm text-right">
                  Catálogo
                </th>
                <th scope="col" className="p-sm text-right">
                  Unitário cotado
                </th>
              </tr>
            </thead>
            <tbody>
              {quote.items.map((item) => (
                <tr key={item.id} className="border-t border-line-subtle">
                  <td className="p-sm">
                    {item.description}
                    {item.requiresInstallation && (
                      <span className="block text-ink-muted">
                        Exige instalação
                      </span>
                    )}
                  </td>
                  <td className="p-sm">{item.skuCode ?? "—"}</td>
                  <td className="p-sm">{item.quantity}</td>
                  <td className="p-sm text-right">
                    {money(item.catalogPrice)}
                  </td>
                  <td className="p-sm text-right">{money(item.unitPrice)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <dl className="ml-auto grid w-full max-w-xs grid-cols-2 gap-xs text-body-sm">
          <dt className="text-ink-muted">Subtotal</dt>
          <dd className="text-right">{money(quote.subtotal)}</dd>
          <dt className="text-ink-muted">Desconto</dt>
          <dd className="text-right">{money(quote.discount)}</dd>
          <dt className="text-ink-muted">Frete</dt>
          <dd className="text-right">{money(quote.shippingTotal)}</dd>
          <dt className="font-semibold">Total</dt>
          <dd className="text-right font-semibold">{money(quote.total)}</dd>
        </dl>
      </section>

      <section
        aria-labelledby="anexos-cotacao"
        className="flex flex-col gap-sm"
      >
        <h2 id="anexos-cotacao" className="text-headline-sm">
          Anexos
        </h2>
        {quote.attachments.length === 0 ? (
          <p className="text-body-sm text-ink-muted">Nenhum arquivo anexado.</p>
        ) : (
          <ul className="flex flex-col gap-xs">
            {quote.attachments.map((attachment) => (
              <li
                key={attachment.id}
                className="flex flex-wrap items-center gap-sm text-body-sm"
              >
                <span className="min-w-0 flex-1 truncate">
                  {attachment.name}
                </span>
                <span className="text-ink-muted">
                  {formatFileSize(attachment.sizeBytes)}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={pending}
                  aria-label={`Baixar ${attachment.name}`}
                  onClick={() => download(attachment.id)}
                >
                  <DownloadIcon aria-hidden /> Baixar
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {quote.answeredAt && (
        <section aria-labelledby="proposta" className="flex flex-col gap-xs">
          <h2 id="proposta" className="text-headline-sm">
            Proposta enviada
          </h2>
          <p className="text-body-sm text-ink-muted">
            {quote.answeredBy ? `Por ${quote.answeredBy}, em ` : "Em "}
            {dateTime.format(new Date(quote.answeredAt))}.
          </p>
          {quote.answerNote && (
            <p className="text-body-sm whitespace-pre-line">
              {quote.answerNote}
            </p>
          )}
        </section>
      )}

      {quote.status === "EXPIRED" && (
        <section
          aria-labelledby="cotacao-vencida"
          className="flex flex-col items-start gap-sm rounded-lg border border-error p-md"
        >
          <h2 id="cotacao-vencida" className="text-headline-sm">
            Cotação vencida
          </h2>
          <p className="text-body-sm">
            A validade terminou: os preços precisam ser revalidados antes de
            responder ou converter. A revalidação aplica os preços atuais do
            catálogo, zera desconto e frete e devolve a cotação à fila.
          </p>
          {canAnswer && (
            <Button
              type="button"
              disabled={pending}
              onClick={() =>
                run(
                  () => revalidateQuote({ quoteId: quote.id }),
                  "Preços revalidados. A cotação voltou para a fila."
                )
              }
            >
              Revalidar preços
            </Button>
          )}
        </section>
      )}

      {quote.status === "REJECTED" && (
        <p className="text-body-sm text-ink-muted">
          O cliente recusou a proposta. Nenhuma ação pendente.
        </p>
      )}

      {quote.status === "CONVERTED" && quote.order && (
        <p className="rounded bg-subtle p-md text-body-sm">
          Convertida no pedido {quote.order.number}, com os valores negociados.{" "}
          <Link
            href={`/admin/pedidos?q=${encodeURIComponent(quote.order.number)}`}
            className="text-primary underline"
          >
            Ver o pedido
          </Link>
        </p>
      )}

      {quote.status === "ANSWERED" && (
        <p className="text-body-sm text-ink-muted">
          Aguardando a aprovação do cliente. O pedido só pode ser gerado depois
          que ele aprovar a proposta na área do cliente.
        </p>
      )}

      {canAnswer && quote.status === "REQUESTED" && (
        <div>
          <Button
            type="button"
            variant="ghost"
            disabled={pending}
            onClick={() =>
              run(
                () => startQuoteReview({ quoteId: quote.id }),
                "Cotação em análise."
              )
            }
          >
            Marcar como em análise
          </Button>
        </div>
      )}

      {canAnswer && answerable && (
        <AnswerForm key={quote.status} quote={quote} onDone={done} />
      )}

      {canAnswer && quote.status === "ACCEPTED" && (
        <ConvertForm quote={quote} onDone={done} />
      )}

      {!canAnswer && (answerable || quote.status === "ACCEPTED") && (
        <p className="text-body-sm text-ink-muted">
          Seu perfil consulta as cotações, mas não responde nem converte.
        </p>
      )}
    </div>
  )
}
