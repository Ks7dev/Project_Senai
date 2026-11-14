import { Suspense } from "react"
import { listAuditLogs } from "@/features/backoffice/audit-log/action/audit-log-actions"
import { AuditLogView } from "@/features/backoffice/audit-log/audit-log-view"
import { auditLogFiltersSchema } from "@/features/backoffice/audit-log/schema/audit-log-schema"
import { requirePagePermission } from "@/features/shared/lib/db/page-guard"

export const metadata = { title: "Auditoria — Atelier Bureau" }

type Search = Record<string, string | string[] | undefined>

/**
 * First value of a search param.
 *
 * @param value - Raw param.
 * @returns The string, or undefined.
 */
function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value
}

/**
 * Loads the audit log after checking the permission.
 *
 * @param props - Search params promise.
 * @returns The viewer or the error message.
 */
async function AuditSection({
  searchParams,
}: {
  searchParams: Promise<Search>
}) {
  await requirePagePermission("audit:read", "/admin/auditoria")
  const params = await searchParams
  const input = {
    entity: first(params.entity),
    action: first(params.action),
    user: first(params.user),
    entityId: first(params.entityId),
    from: first(params.from),
    to: first(params.to),
    page: first(params.page),
  }
  const result = await listAuditLogs(input)
  if (!result.success) {
    return (
      <p role="alert" className="text-body text-error">
        {result.error}
      </p>
    )
  }
  const filters = auditLogFiltersSchema.parse(input)
  return (
    <AuditLogView
      rows={result.rows}
      filters={filters}
      hasNext={result.hasNext}
    />
  )
}

/**
 * Back office route of the audit log (#76, RNF12).
 *
 * @param props - Page props with the search params.
 * @returns The page.
 */
export default function AdminAuditPage(props: PageProps<"/admin/auditoria">) {
  return (
    <div className="flex flex-col gap-lg">
      <header>
        <p className="text-caps text-clay uppercase">Segurança</p>
        <h1 className="text-headline-xl-mobile lg:text-headline-xl">
          Log de auditoria
        </h1>
      </header>
      <Suspense fallback={<p className="text-body">Carregando registros…</p>}>
        <AuditSection searchParams={props.searchParams as Promise<Search>} />
      </Suspense>
    </div>
  )
}
