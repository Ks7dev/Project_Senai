"use client"

import { useMemo, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { zodResolver } from "@hookform/resolvers/zod"
import { useForm, useWatch } from "react-hook-form"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { FormField, fieldAria } from "@/components/ui/form-field"
import { Input } from "@/components/ui/input"
import {
  updateCorporateCredit,
  type CreditAccount,
  type CreditChangeEntry,
} from "@/features/finance/credit-approval/action/credit-approval-actions"
import {
  CREDIT_NOTE_MAX,
  updateCreditSchema,
  type UpdateCreditData,
  type UpdateCreditInput,
} from "@/features/finance/credit-approval/schema/credit-approval-schema"
import {
  CREDIT_STATUS,
  type CreditStatusKey,
} from "@/features/shared/lib/credit/credit-math"

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

/** Status filters of the list. */
const FILTERS: Array<{ key: CreditStatusKey | "ALL"; label: string }> = [
  { key: "ALL", label: "Todas" },
  { key: "PENDING", label: "Em análise" },
  { key: "APPROVED", label: "Aprovadas" },
  { key: "REJECTED", label: "Recusadas" },
  { key: "NONE", label: "Sem análise" },
]

/**
 * Formats a money value or a dash.
 *
 * @param value - Decimal string or null.
 * @returns The formatted value.
 */
function money(value: string | null): string {
  return value === null ? "—" : brl.format(Number(value))
}

/**
 * Formats a CNPJ for display.
 *
 * @param cnpj - Digits only.
 * @returns The CNPJ with punctuation.
 */
function formatCnpj(cnpj: string): string {
  return cnpj.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5")
}

/**
 * Badge with the credit status.
 *
 * @param props - Status.
 * @returns The badge.
 */
function CreditBadge({ status }: { status: CreditStatusKey }) {
  const { label, tone } = CREDIT_STATUS[status]
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
 * History of credit changes of an account (RF58).
 *
 * @param props - Entries, newest first.
 * @returns The list.
 */
function CreditHistory({ history }: { history: CreditChangeEntry[] }) {
  if (history.length === 0) {
    return (
      <p className="text-body-sm text-ink-muted">
        Nenhuma alteração registrada ainda.
      </p>
    )
  }
  return (
    <ol className="flex flex-col gap-sm">
      {history.map((entry) => (
        <li
          key={entry.id}
          className="flex flex-col gap-xs border-l-2 border-line-subtle pl-sm text-body-sm"
        >
          <span className="text-ink">
            {entry.previousStatus
              ? `${CREDIT_STATUS[entry.previousStatus].label} → `
              : ""}
            {CREDIT_STATUS[entry.status].label} · limite{" "}
            {money(entry.previousLimit)} → {money(entry.newLimit)}
          </span>
          <span className="text-ink-muted">
            {entry.changedBy} em{" "}
            <time dateTime={entry.at}>
              {dateTime.format(new Date(entry.at))}
            </time>
          </span>
          {entry.note && <span className="text-ink">“{entry.note}”</span>}
        </li>
      ))}
    </ol>
  )
}

/**
 * Decision form of an account: approve with a limit, refuse with a
 * justification or put it back under review. Validates with the same
 * schema as the Server Action, which enforces the rules.
 *
 * @param props - Account and the callback run after saving.
 * @returns The form.
 */
function CreditForm({
  account,
  onSaved,
}: {
  account: CreditAccount
  onSaved: (message: string) => void
}) {
  const [error, setError] = useState<string>()
  const [pending, startTransition] = useTransition()
  const form = useForm<UpdateCreditInput, unknown, UpdateCreditData>({
    resolver: zodResolver(updateCreditSchema),
    defaultValues: {
      organizationId: account.id,
      status: "APPROVED",
      limit: account.credit.limit?.replace(".", ",") ?? "",
      note: "",
    },
  })
  const errors = form.formState.errors
  const status = useWatch({ control: form.control, name: "status" })
  const prefix = `credit-${account.id}`

  const onSubmit = form.handleSubmit(() =>
    startTransition(async () => {
      setError(undefined)
      const result = await updateCorporateCredit(form.getValues())
      if (!result.success) return setError(result.error)
      form.reset({ ...form.getValues(), note: "" })
      onSaved(
        `Crédito de ${account.name} atualizado: ${CREDIT_STATUS[result.credit.status].label.toLowerCase()}, disponível ${money(result.credit.available)}.`
      )
    })
  )

  return (
    <form
      onSubmit={onSubmit}
      noValidate
      className="flex flex-col gap-md rounded border border-line-subtle bg-canvas p-md"
      aria-label={`Decisão de crédito de ${account.name}`}
    >
      <div className="grid gap-md md:grid-cols-2">
        <FormField
          id={`${prefix}-status`}
          label="Decisão"
          error={errors.status?.message}
        >
          <select
            id={`${prefix}-status`}
            className={SELECT_CLASS}
            {...fieldAria(`${prefix}-status`, errors.status?.message)}
            {...form.register("status")}
          >
            <option value="APPROVED">Aprovar compra faturada</option>
            <option value="REJECTED">Recusar compra faturada</option>
            <option value="PENDING">Deixar em análise</option>
          </select>
        </FormField>
        {status === "APPROVED" && (
          <FormField
            id={`${prefix}-limit`}
            label="Limite de crédito (R$)"
            error={errors.limit?.message}
            hint="Pedidos faturados acima do disponível são bloqueados."
          >
            <Input
              id={`${prefix}-limit`}
              inputMode="decimal"
              placeholder="50000,00"
              {...fieldAria(`${prefix}-limit`, errors.limit?.message)}
              {...form.register("limit")}
            />
          </FormField>
        )}
      </div>
      <FormField
        id={`${prefix}-note`}
        label="Justificativa"
        error={errors.note?.message}
        hint="Obrigatória para recusar. Fica no histórico com o seu nome e a data."
      >
        <textarea
          id={`${prefix}-note`}
          rows={2}
          maxLength={CREDIT_NOTE_MAX}
          className="rounded border border-line bg-canvas p-md text-body"
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
          {pending ? "Salvando…" : "Salvar decisão"}
        </Button>
      </div>
    </form>
  )
}

/**
 * Card of a corporate account with its credit position, the decision
 * form and the history.
 *
 * @param props - Account and the callback run after saving.
 * @returns The card.
 */
function AccountCard({
  account,
  onSaved,
}: {
  account: CreditAccount
  onSaved: (message: string) => void
}) {
  const [open, setOpen] = useState(false)
  const { credit } = account
  const overLimit =
    credit.status === "APPROVED" &&
    credit.limit !== null &&
    Number(credit.used) > Number(credit.limit)
  return (
    <li className="flex flex-col gap-md rounded-lg border border-line-subtle bg-elevated p-md">
      <div className="flex flex-wrap items-start justify-between gap-sm">
        <div className="flex flex-col gap-xs">
          <h3 className="text-subhead text-ink">{account.name}</h3>
          <p className="text-body-sm text-ink-muted">
            {account.legalName ?? "Razão social não informada"}
            {account.cnpj ? ` · CNPJ ${formatCnpj(account.cnpj)}` : ""}
          </p>
        </div>
        <CreditBadge status={credit.status} />
      </div>
      <dl className="grid grid-cols-1 gap-sm text-body-sm sm:grid-cols-3">
        <div>
          <dt className="text-ink-muted">Limite</dt>
          <dd className="text-subhead">{money(credit.limit)}</dd>
        </div>
        <div>
          <dt className="text-ink-muted">Em uso (faturados em aberto)</dt>
          <dd className="text-subhead">{money(credit.used)}</dd>
        </div>
        <div>
          <dt className="text-ink-muted">Disponível</dt>
          <dd className="text-subhead">{money(credit.available)}</dd>
        </div>
      </dl>
      {overLimit && (
        <p role="status" className="rounded bg-subtle p-sm text-body-sm">
          O crédito em uso passou do limite. Novos pedidos faturados ficam
          bloqueados até a quitação dos títulos em aberto.
        </p>
      )}
      <div>
        <Button
          type="button"
          variant="ghost"
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
        >
          {open ? "Fechar análise" : "Analisar crédito"}
        </Button>
      </div>
      {open && (
        <CreditForm
          account={account}
          onSaved={(message) => {
            setOpen(false)
            onSaved(message)
          }}
        />
      )}
      <details>
        <summary className="cursor-pointer text-body-sm text-primary">
          Histórico de alterações ({account.history.length})
        </summary>
        <div className="pt-sm">
          <CreditHistory history={account.history} />
        </div>
      </details>
    </li>
  )
}

/**
 * Credit desk of the finance team (RF58, RN03, RN10): lists the
 * corporate accounts with status, limit, credit in use and available,
 * lets the finance team approve or refuse the invoiced purchase and set
 * the limit, and shows the history of changes. Presentation only: the
 * Server Action checks `credit:approve` and the rules.
 *
 * @param props - Accounts loaded on the server.
 * @returns The desk.
 */
export function CreditApprovalView({
  accounts,
}: {
  accounts: CreditAccount[]
}) {
  const router = useRouter()
  const [filter, setFilter] = useState<CreditStatusKey | "ALL">("ALL")
  const [search, setSearch] = useState("")
  const [message, setMessage] = useState<string>()

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase()
    const digits = term.replace(/\D/g, "")
    return accounts.filter(
      (account) =>
        (filter === "ALL" || account.credit.status === filter) &&
        (term === "" ||
          account.name.toLowerCase().includes(term) ||
          (account.legalName ?? "").toLowerCase().includes(term) ||
          (digits !== "" && (account.cnpj ?? "").includes(digits)))
    )
  }, [accounts, filter, search])

  return (
    <div className="flex flex-col gap-lg">
      <p className="max-w-3xl text-body text-ink-muted">
        Só contas aprovadas compram no faturado (28/56 dias). O crédito em uso
        soma os pedidos faturados em aberto; quando o pedido ultrapassa o
        disponível, a compra faturada é bloqueada automaticamente.
      </p>
      <div className="flex flex-col gap-md md:flex-row md:items-end">
        <FormField id="credit-search" label="Buscar conta" className="md:w-80">
          <Input
            id="credit-search"
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Nome ou CNPJ"
          />
        </FormField>
        <div
          role="group"
          aria-label="Filtrar por situação"
          className="flex flex-wrap gap-xs"
        >
          {FILTERS.map((item) => (
            <Button
              key={item.key}
              type="button"
              size="sm"
              variant={filter === item.key ? "default" : "ghost"}
              aria-pressed={filter === item.key}
              onClick={() => setFilter(item.key)}
            >
              {item.label}
            </Button>
          ))}
        </div>
      </div>
      {message && (
        <p role="status" className="text-body-sm text-primary">
          {message}
        </p>
      )}
      {visible.length === 0 ? (
        <p className="text-body text-ink-muted">
          Nenhuma conta corporativa encontrada.
        </p>
      ) : (
        <ul className="flex flex-col gap-md">
          {visible.map((account) => (
            <AccountCard
              key={account.id}
              account={account}
              onSaved={(text) => {
                setMessage(text)
                router.refresh()
              }}
            />
          ))}
        </ul>
      )}
    </div>
  )
}
