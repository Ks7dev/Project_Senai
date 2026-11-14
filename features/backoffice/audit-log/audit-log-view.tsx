"use client"

import Link from "next/link"
import { ChevronLeftIcon, ChevronRightIcon, SearchIcon } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button, buttonVariants } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import type { AuditLogRow } from "@/features/backoffice/audit-log/action/audit-log-actions"
import {
  AUDIT_ENTITY_LABELS,
  type AuditLogFilters,
} from "@/features/backoffice/audit-log/schema/audit-log-schema"

const dateTime = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeStyle: "medium",
  timeZone: "America/Sao_Paulo",
})

type AuditLogViewProps = {
  /** Rows of the current page. */
  rows: AuditLogRow[]
  /** Filters applied (they fill the form back). */
  filters: AuditLogFilters
  /** Whether there is a next page. */
  hasNext: boolean
}

/**
 * Builds the URL of another page keeping the filters.
 *
 * @param filters - Applied filters.
 * @param page - Target page.
 * @returns The URL.
 */
function pageHref(filters: AuditLogFilters, page: number): string {
  const params = new URLSearchParams()
  for (const key of ["entity", "action", "user", "entityId"] as const) {
    if (filters[key]) params.set(key, filters[key])
  }
  if (filters.from) params.set("from", filters.from)
  if (filters.to) params.set("to", filters.to)
  if (page > 1) params.set("page", String(page))
  const query = params.toString()
  return query ? `/admin/auditoria?${query}` : "/admin/auditoria"
}

/**
 * Before or after values of a row, collapsed by default.
 *
 * @param props - Title and indented JSON.
 * @returns The block, or a dash when empty.
 */
function Values({ title, value }: { title: string; value: string | null }) {
  if (!value) {
    return (
      <p className="text-body-sm text-ink-muted">
        {title}: <span aria-label="sem valor">—</span>
      </p>
    )
  }
  return (
    <details className="min-w-0 rounded border border-line-subtle bg-canvas">
      <summary className="cursor-pointer px-sm py-xs text-body-sm text-ink">
        {title}
      </summary>
      <pre className="max-h-80 overflow-auto px-sm pb-sm text-label-sm break-words whitespace-pre-wrap text-ink">
        {value}
      </pre>
    </details>
  )
}

/**
 * Read-only audit log viewer (#76, RNF12): who did what, when, from
 * which IP, and the values before and after. Filters go in the URL
 * (GET form); no control edits or deletes a row.
 *
 * @param props - Rows, filters and paging.
 * @returns The viewer.
 */
export function AuditLogView({ rows, filters, hasNext }: AuditLogViewProps) {
  return (
    <div className="flex flex-col gap-lg">
      <p className="max-w-2xl text-body text-ink-muted">
        Registro somente leitura das ações sensíveis: aprovações, preços,
        crédito, estornos, perfis e dados pessoais. Datas no horário de
        Brasília.
      </p>
      <form
        role="search"
        action="/admin/auditoria"
        className="grid gap-sm lg:grid-cols-4 sm:grid-cols-2"
      >
        <div className="flex flex-col gap-xs">
          <label htmlFor="auditoria-area" className="text-label">
            Área
          </label>
          <select
            id="auditoria-area"
            name="entity"
            defaultValue={filters.entity}
            className="h-11 rounded border border-line bg-canvas px-md text-body"
          >
            <option value="">Todas</option>
            {Object.entries(AUDIT_ENTITY_LABELS).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-xs">
          <label htmlFor="auditoria-acao" className="text-label">
            Ação (início do nome)
          </label>
          <Input
            id="auditoria-acao"
            name="action"
            placeholder="ex.: order.approve"
            defaultValue={filters.action}
          />
        </div>
        <div className="flex flex-col gap-xs">
          <label htmlFor="auditoria-usuario" className="text-label">
            Usuário (nome ou e-mail)
          </label>
          <Input
            id="auditoria-usuario"
            name="user"
            defaultValue={filters.user}
          />
        </div>
        <div className="flex flex-col gap-xs">
          <label htmlFor="auditoria-registro" className="text-label">
            Código do registro
          </label>
          <Input
            id="auditoria-registro"
            name="entityId"
            defaultValue={filters.entityId}
          />
        </div>
        <div className="flex flex-col gap-xs">
          <label htmlFor="auditoria-de" className="text-label">
            De
          </label>
          <Input
            id="auditoria-de"
            name="from"
            type="date"
            defaultValue={filters.from ?? ""}
          />
        </div>
        <div className="flex flex-col gap-xs">
          <label htmlFor="auditoria-ate" className="text-label">
            Até
          </label>
          <Input
            id="auditoria-ate"
            name="to"
            type="date"
            defaultValue={filters.to ?? ""}
          />
        </div>
        <div className="flex items-end gap-sm sm:col-span-2">
          <Button type="submit">
            <SearchIcon aria-hidden /> Filtrar
          </Button>
          <Link
            href="/admin/auditoria"
            className={buttonVariants({ variant: "ghost" })}
          >
            Limpar filtros
          </Link>
        </div>
      </form>

      {rows.length === 0 ? (
        <p className="text-body text-ink-muted">
          Nenhum registro encontrado com estes filtros.
        </p>
      ) : (
        <ol
          className="flex flex-col gap-md"
          aria-label="Registros de auditoria"
        >
          {rows.map((row) => (
            <li
              key={row.id}
              className="flex flex-col gap-sm rounded-lg border border-line-subtle bg-elevated p-md"
            >
              <div className="flex flex-wrap items-center gap-sm">
                <Badge variant="outline">
                  {AUDIT_ENTITY_LABELS[row.entity] ?? row.entity}
                </Badge>
                <code className="text-body-sm text-ink">{row.action}</code>
                <time
                  dateTime={row.createdAt}
                  className="ml-auto text-body-sm text-ink-muted"
                >
                  {dateTime.format(new Date(row.createdAt))}
                </time>
              </div>
              <dl className="grid gap-xs text-body-sm sm:grid-cols-3">
                <div className="flex flex-col">
                  <dt className="text-ink-muted">Usuário</dt>
                  <dd className="break-words text-ink">
                    {row.user
                      ? `${row.user.name} (${row.user.email})`
                      : "Sistema"}
                  </dd>
                </div>
                <div className="flex flex-col">
                  <dt className="text-ink-muted">IP</dt>
                  <dd className="text-ink">
                    {row.ipAddress ?? "Não informado"}
                  </dd>
                </div>
                <div className="flex flex-col">
                  <dt className="text-ink-muted">Registro</dt>
                  <dd className="break-all text-ink">{row.entityId ?? "—"}</dd>
                </div>
              </dl>
              <div className="grid gap-sm md:grid-cols-2">
                <Values title="Valor anterior" value={row.before} />
                <Values title="Valor novo" value={row.after} />
              </div>
            </li>
          ))}
        </ol>
      )}

      {(filters.page > 1 || hasNext) && (
        <nav aria-label="Páginas" className="flex items-center gap-sm">
          {filters.page > 1 && (
            <Link
              href={pageHref(filters, filters.page - 1)}
              className={buttonVariants({ variant: "ghost" })}
            >
              <ChevronLeftIcon aria-hidden /> Anteriores
            </Link>
          )}
          <span className="text-body-sm text-ink-muted">
            Página {filters.page}
          </span>
          {hasNext && (
            <Link
              href={pageHref(filters, filters.page + 1)}
              className={buttonVariants({ variant: "ghost" })}
            >
              Seguintes <ChevronRightIcon aria-hidden />
            </Link>
          )}
        </nav>
      )}
    </div>
  )
}
