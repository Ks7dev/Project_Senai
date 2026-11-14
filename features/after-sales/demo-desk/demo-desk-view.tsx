"use client"

import { useState, useTransition } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Badge } from "@/components/ui/badge"
import { Button, buttonVariants } from "@/components/ui/button"
import { FormField } from "@/components/ui/form-field"
import {
  updateDemoRequest,
  type DemoDeskRow,
} from "@/features/after-sales/demo-desk/action/demo-desk-actions"
import type { DemoDeskFilter } from "@/features/after-sales/demo-desk/schema/demo-desk-schema"
import {
  DEMO_MODE_LABEL,
  DEMO_STATUS_LABEL,
  formatDemoDate,
  type DemoStatusKey,
} from "@/features/shared/lib/demos/demo-calendar"

/** Button label of each decision. */
const DECISION_LABEL: Record<DemoStatusKey, string> = {
  REQUESTED: "Reabrir",
  CONFIRMED: "Confirmar",
  CANCELED: "Cancelar",
  DONE: "Marcar como realizada",
}

/**
 * One demonstration with the decision buttons and the message field.
 *
 * @param props - Request.
 * @returns The card.
 */
function DemoCard({ request }: { request: DemoDeskRow }) {
  const router = useRouter()
  const [note, setNote] = useState("")
  const [error, setError] = useState<string>()
  const [pending, startTransition] = useTransition()

  const decide = (status: DemoStatusKey) =>
    startTransition(async () => {
      setError(undefined)
      const result = await updateDemoRequest({
        requestId: request.id,
        status: status as "CONFIRMED" | "CANCELED" | "DONE",
        note,
      })
      if (!result.success) return setError(result.error)
      setNote("")
      router.refresh()
    })

  return (
    <li className="flex flex-col gap-sm rounded-lg border border-line-subtle p-md">
      <div className="flex flex-wrap items-center gap-sm">
        <span className="text-subhead">
          {formatDemoDate(request.scheduledAt)}
        </span>
        <Badge
          variant={
            request.status === "CANCELED"
              ? "destructive"
              : request.status === "REQUESTED"
                ? "secondary"
                : "outline"
          }
        >
          {DEMO_STATUS_LABEL[request.status]}
        </Badge>
      </div>
      <dl className="grid gap-xs text-body-sm sm:grid-cols-2">
        <div>
          <dt className="text-ink-muted">Cliente</dt>
          <dd>
            {request.customer.name}
            {request.company ? ` · ${request.company}` : ""}
            <span className="block break-all">{request.customer.email}</span>
            {request.phone && <span className="block">{request.phone}</span>}
          </dd>
        </div>
        <div>
          <dt className="text-ink-muted">Formato e produto</dt>
          <dd>
            {DEMO_MODE_LABEL[request.mode]}
            {request.product ? ` · ${request.product}` : ""}
          </dd>
          <dt className="text-ink-muted">Vendedor</dt>
          <dd>{request.seller ?? "Sem vendedor definido"}</dd>
        </div>
      </dl>
      {request.notes && (
        <p className="text-body-sm whitespace-pre-line">{request.notes}</p>
      )}
      {request.teamNote && (
        <p className="text-body-sm text-ink-muted">
          Mensagem da equipe: {request.teamNote}
        </p>
      )}
      {request.next.length > 0 && (
        <div className="flex flex-col gap-sm">
          <FormField
            id={`demo-note-${request.id}`}
            label="Mensagem ao cliente (obrigatória para cancelar)"
            error={error}
          >
            <textarea
              id={`demo-note-${request.id}`}
              rows={2}
              value={note}
              onChange={(event) => setNote(event.target.value)}
              className="rounded border border-line bg-canvas p-md text-body"
            />
          </FormField>
          <div className="flex flex-wrap gap-sm">
            {request.next.map((status) => (
              <Button
                key={status}
                type="button"
                size="sm"
                variant={status === "CANCELED" ? "ghost" : "default"}
                disabled={pending}
                onClick={() => decide(status)}
              >
                {DECISION_LABEL[status]}
              </Button>
            ))}
          </div>
        </div>
      )}
    </li>
  )
}

/**
 * Demonstration requests of the sales team (RF19): upcoming or all,
 * with the confirmation, cancellation and closing of each one.
 *
 * @param props - Requests and the active filter.
 * @returns The list.
 */
export function DemoDeskView({
  requests,
  filter,
}: {
  requests: DemoDeskRow[]
  filter: DemoDeskFilter
}) {
  return (
    <div className="flex flex-col gap-md">
      <nav aria-label="Filtrar demonstrações" className="flex flex-wrap gap-sm">
        {(
          [
            ["UPCOMING", "Próximas"],
            ["ALL", "Todas"],
          ] as const
        ).map(([value, label]) => (
          <Link
            key={value}
            href={`/admin/atendimento/demonstracoes?filtro=${value}`}
            aria-current={value === filter ? "page" : undefined}
            className={buttonVariants({
              size: "sm",
              variant: value === filter ? "default" : "ghost",
            })}
          >
            {label}
          </Link>
        ))}
      </nav>
      {requests.length === 0 ? (
        <p className="rounded-lg bg-subtle p-lg text-body text-ink-muted">
          Nenhuma demonstração neste filtro.
        </p>
      ) : (
        <ul className="flex flex-col gap-md">
          {requests.map((request) => (
            <DemoCard key={request.id} request={request} />
          ))}
        </ul>
      )}
    </div>
  )
}
