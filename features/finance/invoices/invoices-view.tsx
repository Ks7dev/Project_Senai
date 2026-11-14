"use client"

import { useState, useTransition } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Download } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { FormField } from "@/components/ui/form-field"
import { Input } from "@/components/ui/input"
import {
  reprocessInvoice,
  type InvoiceRow,
  type InvoicesData,
} from "@/features/finance/invoices/action/invoice-actions"
import type { InvoiceFilter } from "@/features/finance/invoices/schema/invoice-schema"

const dateTime = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "America/Sao_Paulo",
})

/** Filters of the list, with their labels. */
const FILTERS: Array<{ key: InvoiceFilter; label: string }> = [
  { key: "ALL", label: "Todas" },
  { key: "FAILED", label: "Com falha" },
  { key: "IN_PROGRESS", label: "Em emissão" },
  { key: "ISSUED", label: "Emitidas" },
]

/** Label and badge variant of each NF-e status. */
const STATUS: Record<
  InvoiceRow["status"],
  { label: string; variant: "default" | "outline" | "destructive" }
> = {
  PENDING: { label: "Na fila", variant: "outline" },
  PROCESSING: { label: "Em autorização", variant: "outline" },
  ISSUED: { label: "Emitida", variant: "default" },
  FAILED: { label: "Falhou", variant: "destructive" },
}

/** A message shown after an action, with its tone. */
type Notice = { text: string; tone: "ok" | "problem" }

/**
 * Access key in groups of four digits, as printed on the DANFE.
 *
 * @param key - 44 digits.
 * @returns The grouped key.
 */
function groupKey(key: string): string {
  return key.replace(/(\d{4})(?=\d)/g, "$1 ")
}

/**
 * Card of an NF-e with its status, key, files, failure and reprocess.
 *
 * @param props - NF-e and the callback run after a reprocess.
 * @returns The card.
 */
function InvoiceCard({
  row,
  onDone,
}: {
  row: InvoiceRow
  onDone: (notice: Notice) => void
}) {
  const [error, setError] = useState<string>()
  const [pending, startTransition] = useTransition()
  const status = STATUS[row.status]
  return (
    <li className="flex flex-col gap-sm rounded-lg border border-line-subtle bg-elevated p-md">
      <div className="flex flex-wrap items-baseline justify-between gap-sm">
        <h3 className="text-subhead text-ink">
          Pedido {row.orderNumber} · {row.customer}
        </h3>
        <Badge variant={status.variant}>{status.label}</Badge>
      </div>
      {row.status === "ISSUED" && row.accessKey ? (
        <>
          <p className="text-body-sm text-ink">
            NF-e {row.number ?? "—"}
            {row.series ? `, série ${row.series}` : ""}
            {row.issuedAt
              ? ` · emitida em ${dateTime.format(new Date(row.issuedAt))}`
              : ""}
          </p>
          <p className="text-body-sm break-all">
            <span className="text-ink-muted">Chave de acesso: </span>
            <span className="font-mono">{groupKey(row.accessKey)}</span>
          </p>
          <div className="flex flex-wrap gap-sm">
            {row.hasXml && (
              <a
                href={`/admin/nfe/${row.id}/xml`}
                className="inline-flex items-center gap-xs text-body-sm text-primary underline"
              >
                <Download aria-hidden="true" className="size-4" />
                Baixar XML
              </a>
            )}
            {row.hasDanfe && (
              <a
                href={`/admin/nfe/${row.id}/danfe`}
                className="inline-flex items-center gap-xs text-body-sm text-primary underline"
              >
                <Download aria-hidden="true" className="size-4" />
                Baixar DANFE (PDF)
              </a>
            )}
          </div>
        </>
      ) : (
        <p className="text-body-sm text-ink-muted">
          Na fila desde {dateTime.format(new Date(row.createdAt))}
          {row.attempts > 0 ? ` · ${row.attempts} tentativa(s) com falha` : ""}
          {row.nextAttemptAt
            ? ` · próxima tentativa em ${dateTime.format(new Date(row.nextAttemptAt))}`
            : row.status === "FAILED"
              ? " · aguardando reprocessamento manual"
              : ""}
        </p>
      )}
      {row.status === "FAILED" && row.lastError && (
        <p className="text-body-sm text-error">{row.lastError}</p>
      )}
      {error && (
        <p role="alert" className="text-body-sm text-error">
          {error}
        </p>
      )}
      {row.status !== "ISSUED" && (
        <div>
          <Button
            type="button"
            variant={row.status === "FAILED" ? "default" : "ghost"}
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                setError(undefined)
                const result = await reprocessInvoice({ invoiceId: row.id })
                if (!result.success) return setError(result.error)
                onDone({
                  text: `Pedido ${row.orderNumber}: ${result.message}`,
                  tone: result.status === "FAILED" ? "problem" : "ok",
                })
              })
            }
          >
            {pending ? "Processando…" : "Reprocessar"}
          </Button>
        </div>
      )}
    </li>
  )
}

/**
 * NF-e of the orders (RF13): issued automatically in homologation after
 * the confirmation, with the XML, the DANFE and the access key, the
 * failures highlighted and the manual reprocess. Presentation only: the
 * Server Actions check the permission.
 *
 * @param props - Data loaded on the server, filter and search.
 * @returns The page content.
 */
export function InvoicesView({
  data,
  filter,
  search,
}: {
  data: InvoicesData
  filter: InvoiceFilter
  search: string
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
        Ambiente de homologação: as NF-e são emitidas sem valor fiscal, logo
        após a confirmação do pedido. Uma falha avisa a equipe por e-mail e é
        tentada de novo automaticamente quando o emissor não responde.
      </p>
      {data.failed > 0 && (
        <p
          role="alert"
          className="rounded border border-error p-md text-body-sm text-error"
        >
          {data.failed === 1
            ? "1 NF-e com falha de emissão."
            : `${data.failed} NF-e com falha de emissão.`}{" "}
          <Link href="/admin/nfe?filtro=FAILED" className="underline">
            Ver falhas
          </Link>
        </p>
      )}
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
      <nav aria-label="Filtrar NF-e" className="flex flex-wrap gap-xs">
        {FILTERS.map((item) => (
          <Link
            key={item.key}
            href={`/admin/nfe?filtro=${item.key}${search ? `&busca=${encodeURIComponent(search)}` : ""}`}
            aria-current={filter === item.key ? "page" : undefined}
            className={
              filter === item.key
                ? "rounded bg-primary px-md py-xs text-label-sm text-primary-foreground"
                : "rounded border border-line-strong px-md py-xs text-label-sm text-ink hover:bg-subtle"
            }
          >
            {item.label}
            {item.key === "IN_PROGRESS" && data.inProgress > 0
              ? ` (${data.inProgress})`
              : ""}
          </Link>
        ))}
      </nav>
      <form action="/admin/nfe" className="flex flex-wrap items-end gap-sm">
        <input type="hidden" name="filtro" value={filter} />
        <FormField
          id="invoices-search"
          label="Número do pedido"
          className="min-w-60 flex-1 md:max-w-sm"
        >
          <Input
            id="invoices-search"
            name="busca"
            type="search"
            defaultValue={search}
            placeholder="AB-2026-000123"
          />
        </FormField>
        <Button type="submit" variant="ghost">
          Buscar
        </Button>
      </form>
      {data.rows.length === 0 ? (
        <p className="text-body text-ink-muted">
          Nenhuma NF-e encontrada neste filtro.
        </p>
      ) : (
        <ul className="flex flex-col gap-md">
          {data.rows.map((row) => (
            <InvoiceCard key={row.id} row={row} onDone={done} />
          ))}
        </ul>
      )}
    </div>
  )
}
