"use client"

import { useState, useTransition } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { zodResolver } from "@hookform/resolvers/zod"
import { useForm } from "react-hook-form"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { FormField, fieldAria } from "@/components/ui/form-field"
import { Input } from "@/components/ui/input"
import {
  confirmInvoicedOrder,
  settleInstallment,
  type PendingInvoicedOrder,
  type ReceivableRow,
  type ReceivablesData,
} from "@/features/finance/invoiced-billing/action/invoiced-billing-actions"
import {
  SETTLEMENT_NOTE_MAX,
  settleInstallmentSchema,
  type ReceivableFilter,
  type SettleInstallmentData,
  type SettleInstallmentInput,
} from "@/features/finance/invoiced-billing/schema/invoiced-billing-schema"
import {
  INSTALLMENT_STATE,
  SETTLEMENT_METHOD_LABEL,
} from "@/features/shared/lib/invoiced/invoiced-math"

const brl = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
})

const date = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeZone: "America/Sao_Paulo",
})

const SELECT_CLASS =
  "h-11 rounded border border-line bg-canvas px-md text-body text-ink focus-visible:border-primary focus-visible:ring-3 focus-visible:ring-primary/12 focus-visible:outline-none"

/** Filters of the list, with their labels. */
const FILTERS: Array<{ key: ReceivableFilter; label: string }> = [
  { key: "OPEN", label: "A vencer" },
  { key: "OVERDUE", label: "Vencidas" },
  { key: "PAID", label: "Pagas" },
  { key: "CANCELED", label: "Canceladas" },
  { key: "ALL", label: "Todas" },
]

/**
 * Today in São Paulo as "AAAA-MM-DD", the default payment date.
 *
 * @returns The date key.
 */
function todayKey(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
  }).format(new Date())
}

/**
 * Settlement form of an open installment (RF33). Validates with the same
 * schema as the Server Action, which enforces the rules.
 *
 * @param props - Installment and the callback run after saving.
 * @returns The form.
 */
function SettleForm({
  row,
  onDone,
}: {
  row: ReceivableRow
  onDone: (message: string) => void
}) {
  const [error, setError] = useState<string>()
  const [pending, startTransition] = useTransition()
  const form = useForm<SettleInstallmentInput, unknown, SettleInstallmentData>({
    resolver: zodResolver(settleInstallmentSchema),
    defaultValues: {
      installmentId: row.id,
      paidAt: todayKey(),
      paidAmount: row.amount.replace(".", ","),
      method: "MANUAL",
      note: "",
    },
  })
  const errors = form.formState.errors
  const prefix = `settle-${row.id}`

  const onSubmit = form.handleSubmit(() =>
    startTransition(async () => {
      setError(undefined)
      const result = await settleInstallment(form.getValues())
      if (!result.success) return setError(result.error)
      onDone(
        `Baixa registrada: parcela ${result.sequence} do pedido ${result.orderNumber}.`
      )
    })
  )

  return (
    <form
      onSubmit={onSubmit}
      noValidate
      aria-label={`Baixa da parcela ${row.sequence} do pedido ${row.orderNumber}`}
      className="flex flex-col gap-md rounded border border-line-subtle bg-canvas p-md"
    >
      <div className="grid gap-md md:grid-cols-3">
        <FormField
          id={`${prefix}-date`}
          label="Data do pagamento"
          error={errors.paidAt?.message}
        >
          <Input
            id={`${prefix}-date`}
            type="date"
            {...fieldAria(`${prefix}-date`, errors.paidAt?.message)}
            {...form.register("paidAt")}
          />
        </FormField>
        <FormField
          id={`${prefix}-amount`}
          label="Valor pago (R$)"
          error={errors.paidAmount?.message}
        >
          <Input
            id={`${prefix}-amount`}
            inputMode="decimal"
            {...fieldAria(`${prefix}-amount`, errors.paidAmount?.message)}
            {...form.register("paidAmount")}
          />
        </FormField>
        <FormField
          id={`${prefix}-method`}
          label="Confirmado por"
          error={errors.method?.message}
        >
          <select
            id={`${prefix}-method`}
            className={SELECT_CLASS}
            {...fieldAria(`${prefix}-method`, errors.method?.message)}
            {...form.register("method")}
          >
            <option value="MANUAL">{SETTLEMENT_METHOD_LABEL.MANUAL}</option>
            <option value="BANK_RETURN">
              {SETTLEMENT_METHOD_LABEL.BANK_RETURN}
            </option>
          </select>
        </FormField>
      </div>
      <FormField
        id={`${prefix}-note`}
        label="Observação"
        error={errors.note?.message}
        hint="Por exemplo, o comprovante ou o lote do retorno bancário."
      >
        <Input
          id={`${prefix}-note`}
          maxLength={SETTLEMENT_NOTE_MAX}
          {...fieldAria(`${prefix}-note`, errors.note?.message)}
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
          {pending ? "Registrando…" : "Registrar baixa"}
        </Button>
      </div>
    </form>
  )
}

/**
 * Card of an installment with its boleto, due date and settlement.
 *
 * @param props - Installment and the callback run after a settlement.
 * @returns The card.
 */
function ReceivableCard({
  row,
  onDone,
}: {
  row: ReceivableRow
  onDone: (message: string) => void
}) {
  const [open, setOpen] = useState(false)
  const state = INSTALLMENT_STATE[row.state]
  const settleable = row.state === "OPEN" || row.state === "OVERDUE"
  return (
    <li className="flex flex-col gap-sm rounded-lg border border-line-subtle bg-elevated p-md">
      <div className="flex flex-wrap items-baseline justify-between gap-sm">
        <h3 className="text-subhead text-ink">
          Pedido {row.orderNumber} · parcela {row.sequence} de {row.count}
        </h3>
        <Badge
          variant={
            state.tone === "problem"
              ? "destructive"
              : state.tone === "done"
                ? "default"
                : "outline"
          }
        >
          {state.label}
        </Badge>
      </div>
      <p className="text-body-sm text-ink-muted">
        {row.company ?? row.customer} · {row.dueDays} dias · vence em{" "}
        <time dateTime={row.dueDate}>{date.format(new Date(row.dueDate))}</time>
      </p>
      <p className="text-headline-sm">{brl.format(Number(row.amount))}</p>
      <p className="text-body-sm break-all text-ink">
        <span className="text-ink-muted">Boleto {row.boletoNumber}: </span>
        <span className="font-mono">{row.digitableLine}</span>
      </p>
      {row.settlement && (
        <p className="rounded bg-subtle p-sm text-body-sm">
          {SETTLEMENT_METHOD_LABEL[row.settlement.method]} de{" "}
          {brl.format(Number(row.settlement.paidAmount))} em{" "}
          {date.format(new Date(row.settlement.paidAt))}
          {row.settlement.by ? `, por ${row.settlement.by}` : ""}
          {row.settlement.note ? `. ${row.settlement.note}` : ""}
        </p>
      )}
      {settleable && (
        <div>
          <Button
            type="button"
            variant="ghost"
            aria-expanded={open}
            onClick={() => setOpen((value) => !value)}
          >
            {open ? "Fechar baixa" : "Dar baixa"}
          </Button>
        </div>
      )}
      {settleable && open && (
        <SettleForm
          row={row}
          onDone={(message) => {
            setOpen(false)
            onDone(message)
          }}
        />
      )}
    </li>
  )
}

/**
 * Invoiced order waiting for the finance confirmation, with the credit
 * of the company and the confirm button.
 *
 * @param props - Order, whether the user may confirm and the callback.
 * @returns The item.
 */
function PendingOrder({
  order,
  canConfirm,
  onDone,
}: {
  order: PendingInvoicedOrder
  canConfirm: boolean
  onDone: (message: string) => void
}) {
  const [error, setError] = useState<string>()
  const [pending, startTransition] = useTransition()
  return (
    <li className="flex flex-col gap-sm rounded-lg border border-line-subtle bg-elevated p-md">
      <div className="flex flex-wrap items-baseline justify-between gap-sm">
        <h3 className="text-subhead text-ink">
          Pedido {order.number}
          {order.company ? ` · ${order.company}` : ""}
        </h3>
        <strong className="text-headline-sm">
          {brl.format(Number(order.total))}
        </strong>
      </div>
      <p className="text-body-sm text-ink-muted">
        Feito em{" "}
        <time dateTime={order.createdAt}>
          {date.format(new Date(order.createdAt))}
        </time>
        {order.credit
          ? ` · crédito disponível ${brl.format(Number(order.credit.available))}`
          : " · sem conta corporativa"}
      </p>
      {error && (
        <p role="alert" className="text-body-sm text-error">
          {error}
        </p>
      )}
      {canConfirm && (
        <div>
          <Button
            type="button"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                setError(undefined)
                const result = await confirmInvoicedOrder({
                  orderId: order.id,
                })
                if (!result.success) return setError(result.error)
                onDone(
                  `Pedido ${result.number} confirmado. Os boletos foram gerados e enviados ao cliente.`
                )
              })
            }
          >
            {pending ? "Confirmando…" : "Confirmar faturado"}
          </Button>
        </div>
      )}
    </li>
  )
}

/**
 * Receivables of the invoiced purchase (RF12, RF33, RN03, RN17): own
 * boletos with due dates in 28 and 56 days, overdue control and manual
 * settlement, plus the invoiced orders waiting for the finance
 * confirmation. Presentation only: the Server Actions check the
 * permissions and the rules.
 *
 * @param props - Data loaded on the server and the current filter.
 * @returns The page content.
 */
export function InvoicedBillingView({
  data,
  filter,
  search,
}: {
  data: ReceivablesData
  filter: ReceivableFilter
  search: string
}) {
  const router = useRouter()
  const [message, setMessage] = useState<string>()
  const done = (text: string) => {
    setMessage(text)
    router.refresh()
  }

  return (
    <div className="flex flex-col gap-lg">
      <dl className="grid gap-md sm:grid-cols-2">
        <div className="rounded-lg border border-line-subtle bg-elevated p-md">
          <dt className="text-body-sm text-ink-muted">A receber</dt>
          <dd className="text-headline-md">
            {brl.format(Number(data.totals.open))}
          </dd>
        </div>
        <div className="rounded-lg border border-line-subtle bg-elevated p-md">
          <dt className="text-body-sm text-ink-muted">Vencido</dt>
          <dd className="text-headline-md text-error">
            {brl.format(Number(data.totals.overdue))}
          </dd>
        </div>
      </dl>
      <p className="max-w-3xl text-body-sm text-ink-muted">
        Ambiente de homologação: os boletos usam um banco fictício e a baixa é
        registrada à mão, com a data, o valor e a forma de confirmação.
      </p>

      {message && (
        <p role="status" className="text-body-sm text-primary">
          {message}
        </p>
      )}

      {data.pending.length > 0 && (
        <section
          aria-labelledby="pending-title"
          className="flex flex-col gap-md"
        >
          <h2 id="pending-title" className="text-headline-md">
            Pedidos faturados aguardando confirmação
          </h2>
          <ul className="flex flex-col gap-md">
            {data.pending.map((order) => (
              <PendingOrder
                key={order.id}
                order={order}
                canConfirm={data.canConfirm}
                onDone={done}
              />
            ))}
          </ul>
        </section>
      )}

      <section
        aria-labelledby="receivables-title"
        className="flex flex-col gap-md"
      >
        <h2 id="receivables-title" className="text-headline-md">
          Parcelas
        </h2>
        <nav aria-label="Filtrar parcelas" className="flex flex-wrap gap-xs">
          {FILTERS.map((item) => (
            <Link
              key={item.key}
              href={`/admin/financeiro/faturado?filtro=${item.key}${search ? `&busca=${encodeURIComponent(search)}` : ""}`}
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
        <form
          action="/admin/financeiro/faturado"
          className="flex flex-wrap items-end gap-sm"
        >
          <input type="hidden" name="filtro" value={filter} />
          <FormField
            id="receivables-search"
            label="Buscar"
            className="min-w-60 flex-1 md:max-w-sm"
          >
            <Input
              id="receivables-search"
              name="busca"
              type="search"
              defaultValue={search}
              placeholder="Pedido, empresa ou boleto"
            />
          </FormField>
          <Button type="submit" variant="ghost">
            Buscar
          </Button>
        </form>
        {data.rows.length === 0 ? (
          <p className="text-body text-ink-muted">
            Nenhuma parcela encontrada neste filtro.
          </p>
        ) : (
          <ul className="flex flex-col gap-md">
            {data.rows.map((row) => (
              <ReceivableCard key={row.id} row={row} onDone={done} />
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
