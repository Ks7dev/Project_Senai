"use client"

import { useState, useTransition } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { zodResolver } from "@hookform/resolvers/zod"
import { useForm, useWatch } from "react-hook-form"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { FormField, fieldAria } from "@/components/ui/form-field"
import { Input } from "@/components/ui/input"
import {
  approveRefund,
  rejectRefund,
  requestRefund,
  retryRefund,
  type RefundOrderSummary,
  type RefundOutcome,
  type RefundRow,
  type RefundsData,
} from "@/features/finance/refunds/action/refund-actions"
import {
  REFUND_DECISION_NOTE_MAX,
  REFUND_NOTE_MAX,
  REFUND_REASONS,
  refundRequestSchema,
  type RefundFilter,
  type RefundRequestData,
  type RefundRequestInput,
} from "@/features/finance/refunds/schema/refund-schema"
import {
  REFUND_CHANNEL,
  REFUND_REASON,
  REFUND_STATUS,
} from "@/features/shared/lib/refunds/refund-rules"

const brl = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
})

const dateTime = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "America/Sao_Paulo",
})

const SELECT_CLASS =
  "h-11 rounded border border-line bg-canvas px-md text-body text-ink focus-visible:border-primary focus-visible:ring-3 focus-visible:ring-primary/12 focus-visible:outline-none"

/** Filters of the list, with their labels. */
const FILTERS: Array<{ key: RefundFilter; label: string }> = [
  { key: "ALL", label: "Todos" },
  { key: "PENDING_APPROVAL", label: "Aguardando aprovação" },
  { key: "PROCESSING", label: "Em processamento" },
  { key: "COMPLETED", label: "Estornados" },
  { key: "FAILED", label: "Falhas e recusas" },
]

/** Payment method labels, in Portuguese. */
const PAYMENT_METHOD_LABEL: Record<
  RefundOrderSummary["paymentMethod"],
  string
> = {
  CARD: "Cartão",
  PIX: "Pix",
  BOLETO: "Boleto",
  INVOICED: "Faturado 28/56 dias",
}

/** A message shown after an action, with its tone. */
type Notice = { text: string; tone: "ok" | "problem" }

/**
 * Notice of a refund outcome: failures in the error color.
 *
 * @param outcome - Outcome of the action.
 * @returns The notice.
 */
function outcomeNotice(outcome: RefundOutcome): Notice {
  return {
    text: outcome.message,
    tone: outcome.status === "FAILED" ? "problem" : "ok",
  }
}

/**
 * Badge variant of a refund status.
 *
 * @param tone - Status tone.
 * @returns The variant.
 */
function badgeVariant(tone: string) {
  if (tone === "problem") return "destructive" as const
  if (tone === "done") return "default" as const
  return "outline" as const
}

/**
 * Summary of the order found and the refund request form (RF34). The
 * form validates with the same schema as the Server Action, which
 * enforces the rules (RN07, RN18, RN22).
 *
 * @param props - Order and the callback run after the request.
 * @returns The form.
 */
function RequestForm({
  order,
  onDone,
}: {
  order: RefundOrderSummary
  onDone: (notice: Notice) => void
}) {
  const [error, setError] = useState<string>()
  const [pending, startTransition] = useTransition()
  const form = useForm<RefundRequestInput, unknown, RefundRequestData>({
    resolver: zodResolver(refundRequestSchema),
    defaultValues: {
      orderId: order.id,
      reason: order.withdrawalUntil ? "WITHDRAWAL" : "EVALUATED_RETURN",
      kind: "FULL",
      amount: "",
      note: "",
    },
  })
  const errors = form.formState.errors
  const kind = useWatch({ control: form.control, name: "kind" })
  const reason = useWatch({ control: form.control, name: "reason" })

  const onSubmit = form.handleSubmit(() =>
    startTransition(async () => {
      setError(undefined)
      const result = await requestRefund(form.getValues())
      if (!result.success) return setError(result.error)
      form.reset({ ...form.getValues(), amount: "", note: "" })
      onDone(outcomeNotice(result))
    })
  )

  return (
    <section
      aria-labelledby="refund-order-title"
      className="flex flex-col gap-md rounded-lg border border-line-subtle bg-elevated p-md"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-sm">
        <h2 id="refund-order-title" className="text-headline-md">
          Pedido {order.number}
        </h2>
        <Badge variant="outline">{order.statusLabel}</Badge>
      </div>
      <dl className="grid gap-sm text-body-sm lg:grid-cols-3 sm:grid-cols-2">
        <div>
          <dt className="text-ink-muted">Cliente</dt>
          <dd>
            {order.company ?? order.customer} ({order.personType})
          </dd>
        </div>
        <div>
          <dt className="text-ink-muted">Pagamento</dt>
          <dd>
            {PAYMENT_METHOD_LABEL[order.paymentMethod]}
            {order.providerPaymentId
              ? ` · payment_id ${order.providerPaymentId}`
              : ""}
          </dd>
        </div>
        <div>
          <dt className="text-ink-muted">Total do pedido</dt>
          <dd>{brl.format(Number(order.total))}</dd>
        </div>
        <div>
          <dt className="text-ink-muted">
            {order.paymentMethod === "INVOICED"
              ? "Recebido nas parcelas"
              : "Pagamento aprovado"}
          </dt>
          <dd>{brl.format(Number(order.received))}</dd>
        </div>
        <div>
          <dt className="text-ink-muted">Já estornado</dt>
          <dd>{brl.format(Number(order.refunded))}</dd>
        </div>
        <div>
          <dt className="text-ink-muted">Disponível para estorno</dt>
          <dd className="text-subhead">
            {brl.format(Number(order.refundable))}
          </dd>
        </div>
      </dl>
      <ul className="flex flex-col gap-xs text-body-sm text-ink-muted">
        <li>Devolução por: {REFUND_CHANNEL[order.channel]}.</li>
        {order.withdrawalUntil && (
          <li>
            Arrependimento (RN22) até{" "}
            <time dateTime={order.withdrawalUntil}>
              {dateTime.format(new Date(order.withdrawalUntil))}
            </time>
            .
          </li>
        )}
        {order.requiresApproval && (
          <li>
            Pedido corporativo faturado: o estorno aguarda a aprovação do
            financeiro (RN07).
          </li>
        )}
        {order.paymentMethod === "INVOICED" && (
          <li>
            No estorno total, as parcelas em aberto são canceladas e o valor já
            recebido é devolvido por transferência.
          </li>
        )}
      </ul>

      {order.hasInFlightRefund ? (
        <p className="text-body-sm text-ink-muted">
          Já existe um estorno deste pedido aguardando aprovação ou em
          processamento. Acompanhe na lista abaixo.
        </p>
      ) : (
        <form
          onSubmit={onSubmit}
          noValidate
          aria-label={`Estorno do pedido ${order.number}`}
          className="flex flex-col gap-md"
        >
          <div className="grid gap-md md:grid-cols-3">
            <FormField
              id="refund-reason"
              label="Motivo"
              error={errors.reason?.message}
              hint={REFUND_REASON[reason as keyof typeof REFUND_REASON]?.help}
            >
              <select
                id="refund-reason"
                className={SELECT_CLASS}
                {...fieldAria("refund-reason", errors.reason?.message)}
                {...form.register("reason")}
              >
                {REFUND_REASONS.map((key) => (
                  <option key={key} value={key}>
                    {REFUND_REASON[key].label}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField
              id="refund-kind"
              label="Tipo"
              error={errors.kind?.message}
            >
              <select
                id="refund-kind"
                className={SELECT_CLASS}
                {...fieldAria("refund-kind", errors.kind?.message)}
                {...form.register("kind")}
              >
                <option value="FULL">Total (todo o disponível)</option>
                <option value="PARTIAL">Parcial</option>
              </select>
            </FormField>
            {kind === "PARTIAL" && (
              <FormField
                id="refund-amount"
                label="Valor (R$)"
                error={errors.amount?.message}
              >
                <Input
                  id="refund-amount"
                  inputMode="decimal"
                  placeholder="0,00"
                  {...fieldAria("refund-amount", errors.amount?.message)}
                  {...form.register("amount")}
                />
              </FormField>
            )}
          </div>
          <FormField
            id="refund-note"
            label="Justificativa"
            error={errors.note?.message}
            hint="Fica no histórico e na auditoria. Na devolução, informe o número do laudo."
          >
            <textarea
              id="refund-note"
              rows={3}
              maxLength={REFUND_NOTE_MAX}
              className="rounded border border-line bg-canvas p-md text-body text-ink focus-visible:border-primary focus-visible:ring-3 focus-visible:ring-primary/12 focus-visible:outline-none"
              {...fieldAria("refund-note", errors.note?.message)}
              {...form.register("note")}
            />
          </FormField>
          {error && (
            <p role="alert" className="text-body-sm text-error">
              {error}
            </p>
          )}
          <div>
            <Button type="submit" disabled={pending}>
              {pending
                ? "Enviando…"
                : order.requiresApproval
                  ? "Enviar para aprovação"
                  : "Estornar"}
            </Button>
          </div>
        </form>
      )}
    </section>
  )
}

/**
 * Approve and refuse buttons of a refund waiting for the finance team.
 *
 * @param props - Refund and the callback run after the decision.
 * @returns The controls.
 */
function DecisionControls({
  row,
  onDone,
}: {
  row: RefundRow
  onDone: (notice: Notice) => void
}) {
  const [note, setNote] = useState("")
  const [error, setError] = useState<string>()
  const [pending, startTransition] = useTransition()
  const noteId = `refund-decision-${row.id}`

  const decide = (approve: boolean) =>
    startTransition(async () => {
      setError(undefined)
      if (approve) {
        const result = await approveRefund({ refundId: row.id, note })
        if (!result.success) return setError(result.error)
        return onDone(outcomeNotice(result))
      }
      const result = await rejectRefund({ refundId: row.id, note })
      if (!result.success) return setError(result.error)
      onDone({
        text: `Estorno do pedido ${row.orderNumber} recusado.`,
        tone: "ok",
      })
    })

  return (
    <div className="flex flex-col gap-sm rounded border border-line-subtle bg-canvas p-md">
      <FormField
        id={noteId}
        label="Observação da decisão"
        hint="Obrigatória para recusar."
      >
        <Input
          id={noteId}
          value={note}
          maxLength={REFUND_DECISION_NOTE_MAX}
          onChange={(event) => setNote(event.target.value)}
        />
      </FormField>
      {error && (
        <p role="alert" className="text-body-sm text-error">
          {error}
        </p>
      )}
      <div className="flex flex-wrap gap-sm">
        <Button type="button" disabled={pending} onClick={() => decide(true)}>
          {pending ? "Enviando…" : "Aprovar e estornar"}
        </Button>
        <Button
          type="button"
          variant="ghost"
          disabled={pending}
          onClick={() => decide(false)}
        >
          Recusar
        </Button>
      </div>
    </div>
  )
}

/**
 * Card of a refund with its status, request, decision and outcome.
 *
 * @param props - Refund, whether the user may decide and the callback.
 * @returns The card.
 */
function RefundCard({
  row,
  canApprove,
  onDone,
}: {
  row: RefundRow
  canApprove: boolean
  onDone: (notice: Notice) => void
}) {
  const [error, setError] = useState<string>()
  const [pending, startTransition] = useTransition()
  const status = REFUND_STATUS[row.status]
  return (
    <li className="flex flex-col gap-sm rounded-lg border border-line-subtle bg-elevated p-md">
      <div className="flex flex-wrap items-baseline justify-between gap-sm">
        <h3 className="text-subhead text-ink">
          Pedido {row.orderNumber} · {row.customer}
        </h3>
        <Badge variant={badgeVariant(status.tone)}>{status.label}</Badge>
      </div>
      <p className="text-headline-sm">
        {brl.format(Number(row.amount))}{" "}
        <span className="text-body-sm text-ink-muted">
          {row.kind === "FULL" ? "total" : "parcial"} ·{" "}
          {REFUND_REASON[row.reason].label} · {REFUND_CHANNEL[row.channel]}
        </span>
      </p>
      <p className="text-body-sm text-ink">{row.note}</p>
      <p className="text-body-sm text-ink-muted">
        Pedido por {row.requestedBy} em{" "}
        <time dateTime={row.requestedAt}>
          {dateTime.format(new Date(row.requestedAt))}
        </time>
        {row.decidedBy && row.decidedAt
          ? ` · ${row.status === "REJECTED" ? "recusado" : "aprovado"} por ${row.decidedBy} em ${dateTime.format(new Date(row.decidedAt))}`
          : ""}
        {row.decisionNote ? `: ${row.decisionNote}` : ""}
      </p>
      {row.completedAt && (
        <p className="text-body-sm text-ink-muted">
          Estornado em{" "}
          <time dateTime={row.completedAt}>
            {dateTime.format(new Date(row.completedAt))}
          </time>
          {row.providerRefundId
            ? ` · estorno ${row.providerRefundId} no Mercado Pago`
            : ""}
        </p>
      )}
      {row.failureReason && row.status !== "COMPLETED" && (
        <p className="text-body-sm text-error">{row.failureReason}</p>
      )}
      {error && (
        <p role="alert" className="text-body-sm text-error">
          {error}
        </p>
      )}
      {row.status === "PROCESSING" && (
        <div>
          <Button
            type="button"
            variant="ghost"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                setError(undefined)
                const result = await retryRefund({ refundId: row.id })
                if (!result.success) return setError(result.error)
                onDone(outcomeNotice(result))
              })
            }
          >
            {pending ? "Consultando…" : "Tentar de novo"}
          </Button>
        </div>
      )}
      {row.status === "PENDING_APPROVAL" && canApprove && (
        <DecisionControls row={row} onDone={onDone} />
      )}
    </li>
  )
}

/**
 * Refunds of the finance back office (RF34, RN07, RN18, RN22): finds an
 * order, shows what may go back and asks for the full or partial
 * refund; lists the refunds with the approval of the corporate invoiced
 * ones and a new attempt for those Mercado Pago did not answer.
 * Presentation only: the Server Actions check the permissions and the
 * rules.
 *
 * @param props - Data loaded on the server, the order found and the
 * lookup error.
 * @returns The page content.
 */
export function RefundsView({
  data,
  filter,
  orderNumber,
  order,
  lookupError,
}: {
  data: RefundsData
  filter: RefundFilter
  orderNumber: string
  order: RefundOrderSummary | null
  lookupError: string | null
}) {
  const router = useRouter()
  const [notice, setNotice] = useState<Notice>()
  const done = (next: Notice) => {
    setNotice(next)
    router.refresh()
  }

  return (
    <div className="flex flex-col gap-lg">
      <p className="max-w-3xl text-body-sm text-ink-muted">
        Ambiente de homologação: os estornos usam o sandbox do Mercado Pago. No
        faturado, o valor recebido volta por transferência registrada aqui.
      </p>

      <form
        action="/admin/financeiro/estornos"
        className="flex flex-wrap items-end gap-sm"
      >
        <input type="hidden" name="filtro" value={filter} />
        <FormField
          id="refund-lookup"
          label="Número do pedido"
          className="min-w-60 flex-1 md:max-w-sm"
          error={lookupError ?? undefined}
        >
          <Input
            id="refund-lookup"
            name="pedido"
            defaultValue={orderNumber}
            placeholder="AB-2026-000123"
            {...fieldAria("refund-lookup", lookupError ?? undefined)}
          />
        </FormField>
        <Button type="submit" variant="ghost">
          Buscar pedido
        </Button>
      </form>

      {notice && (
        <p
          role="status"
          className={
            notice.tone === "problem"
              ? "text-body-sm text-error"
              : "text-body-sm text-primary"
          }
        >
          {notice.text}
        </p>
      )}

      {order && <RequestForm key={order.id} order={order} onDone={done} />}

      <section aria-labelledby="refunds-title" className="flex flex-col gap-md">
        <h2 id="refunds-title" className="text-headline-md">
          Estornos
          {data.pendingApproval > 0
            ? ` · ${data.pendingApproval} aguardando aprovação`
            : ""}
        </h2>
        <nav aria-label="Filtrar estornos" className="flex flex-wrap gap-xs">
          {FILTERS.map((item) => (
            <Link
              key={item.key}
              href={`/admin/financeiro/estornos?filtro=${item.key}`}
              aria-current={filter === item.key ? "page" : undefined}
              className={
                filter === item.key
                  ? "rounded bg-primary px-md py-xs text-label-sm text-primary-foreground"
                  : "rounded border border-line-strong px-md py-xs text-label-sm text-ink hover:bg-subtle"
              }
            >
              {item.label}
            </Link>
          ))}
        </nav>
        {data.rows.length === 0 ? (
          <p className="text-body text-ink-muted">
            Nenhum estorno encontrado neste filtro.
          </p>
        ) : (
          <ul className="flex flex-col gap-md">
            {data.rows.map((row) => (
              <RefundCard
                key={row.id}
                row={row}
                canApprove={data.canApprove}
                onDone={done}
              />
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
