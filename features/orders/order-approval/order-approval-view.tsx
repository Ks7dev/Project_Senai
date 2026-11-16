"use client"

import { useState, useTransition } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { FormField, fieldAria } from "@/components/ui/form-field"
import {
  decideOrderApproval,
  type ApprovalRecord,
  type ApprovalsData,
  type PendingApproval,
} from "@/features/orders/order-approval/action/order-approval-actions"
import {
  APPROVAL_NOTE_MAX,
  orderApprovalSchema,
  type ApprovalDecisionKey,
} from "@/features/orders/order-approval/schema/order-approval-schema"

const brl = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
})

const dateTime = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "America/Sao_Paulo",
})

/** Label of each decision. */
const DECISION_LABEL: Record<ApprovalDecisionKey, string> = {
  APPROVED: "Aprovado",
  REJECTED: "Recusado",
}

/**
 * Card of an order waiting for approval, with its lines and the
 * decision form. The rules are enforced by the Server Action; the form
 * only validates the justification with the same schema.
 *
 * @param props - The order and the callback run after a decision.
 * @returns The card.
 */
function PendingCard({
  order,
  onDecided,
}: {
  order: PendingApproval
  onDecided: (message: string) => void
}) {
  const [pending, startTransition] = useTransition()
  const [note, setNote] = useState("")
  const [noteError, setNoteError] = useState<string>()
  const [error, setError] = useState<string>()
  const noteId = `approval-note-${order.orderId}`

  const decide = (decision: ApprovalDecisionKey) => {
    setError(undefined)
    const input = { orderId: order.orderId, decision, note }
    const parsed = orderApprovalSchema.safeParse(input)
    if (!parsed.success) {
      setNoteError(parsed.error.issues[0]?.message)
      return
    }
    setNoteError(undefined)
    startTransition(async () => {
      const result = await decideOrderApproval(input)
      if (!result.success) return setError(result.error)
      onDecided(
        decision === "APPROVED"
          ? `Pedido ${result.number} aprovado. O solicitante foi avisado por e-mail.`
          : `Pedido ${result.number} recusado e cancelado. O solicitante foi avisado por e-mail.`
      )
    })
  }

  return (
    <li className="flex flex-col gap-md rounded-lg border border-line-subtle bg-elevated p-md">
      <div className="flex flex-wrap items-baseline justify-between gap-sm">
        <h3 className="text-subhead text-ink">
          <Link
            href={`/conta/pedidos/${order.orderId}`}
            className="text-primary underline"
          >
            Pedido {order.number}
          </Link>
        </h3>
        <strong className="text-headline-sm">
          {brl.format(Number(order.total))}
        </strong>
      </div>
      <p className="text-body-sm text-ink-muted">
        Solicitado por {order.requester} em{" "}
        <time dateTime={order.createdAt}>
          {dateTime.format(new Date(order.createdAt))}
        </time>{" "}
        · {order.paymentMethod} · frete{" "}
        {brl.format(Number(order.shippingTotal))}
      </p>
      <ul className="flex flex-col gap-xs text-body-sm">
        {order.items.map((item) => (
          <li key={item.id} className="flex justify-between gap-sm">
            <span>
              {item.quantity} × {item.name}
            </span>
            <span className="shrink-0">{brl.format(Number(item.total))}</span>
          </li>
        ))}
      </ul>
      {order.canDecide ? (
        <>
          <FormField
            id={noteId}
            label="Justificativa"
            error={noteError}
            hint="Obrigatória para recusar e opcional para aprovar. Fica registrada com o seu nome e a data."
          >
            <textarea
              id={noteId}
              rows={3}
              maxLength={APPROVAL_NOTE_MAX}
              value={note}
              onChange={(event) => setNote(event.target.value)}
              className="rounded border border-line bg-canvas p-md text-body"
              {...fieldAria(noteId, noteError)}
            />
          </FormField>
          {error && (
            <p role="alert" className="text-body-sm text-error">
              {error}
            </p>
          )}
          <div className="flex flex-wrap gap-sm">
            <Button disabled={pending} onClick={() => decide("APPROVED")}>
              Aprovar pedido
            </Button>
            <Button
              variant="destructive"
              disabled={pending}
              onClick={() => decide("REJECTED")}
            >
              Recusar pedido
            </Button>
          </div>
        </>
      ) : (
        <p className="rounded bg-subtle p-sm text-body-sm text-ink">
          Você fez este pedido, então a decisão cabe a outro aprovador da
          empresa.
        </p>
      )}
    </li>
  )
}

/**
 * Table with the decisions already taken: who, when and why (RF11).
 *
 * @param props - Decision records.
 * @returns The table.
 */
function HistoryTable({ history }: { history: ApprovalRecord[] }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-line-subtle">
      <table className="w-full min-w-[640px] text-left text-body-sm">
        <caption className="sr-only">Decisões de aprovação</caption>
        <thead className="bg-subtle text-label">
          <tr>
            <th scope="col" className="p-sm">
              Pedido
            </th>
            <th scope="col" className="p-sm">
              Decisão
            </th>
            <th scope="col" className="p-sm">
              Aprovador
            </th>
            <th scope="col" className="p-sm">
              Data
            </th>
            <th scope="col" className="p-sm">
              Justificativa
            </th>
            <th scope="col" className="p-sm text-right">
              Total
            </th>
          </tr>
        </thead>
        <tbody>
          {history.map((record) => (
            <tr key={record.id} className="border-t border-line-subtle">
              <td className="p-sm">
                <Link
                  href={`/conta/pedidos/${record.orderId}`}
                  className="text-primary underline"
                >
                  {record.number}
                </Link>
                <span className="block text-label-sm text-ink-muted">
                  {record.requester}
                </span>
              </td>
              <td className="p-sm">
                <Badge
                  variant={
                    record.decision === "REJECTED" ? "destructive" : "default"
                  }
                >
                  {DECISION_LABEL[record.decision]}
                </Badge>
              </td>
              <td className="p-sm">{record.decidedBy}</td>
              <td className="p-sm">
                <time dateTime={record.decidedAt}>
                  {dateTime.format(new Date(record.decidedAt))}
                </time>
              </td>
              <td className="p-sm">{record.note ?? "—"}</td>
              <td className="p-sm text-right">
                {brl.format(Number(record.total))}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/**
 * Approvals page of the corporate account (RF11, RN01): orders above
 * the limit waiting for a decision and the decisions already taken.
 * Presentation only: the data and the rules come from the Server
 * Actions.
 *
 * @param props - Approvals data.
 * @returns The page content.
 */
export function OrderApprovalView({ approvals }: { approvals: ApprovalsData }) {
  const router = useRouter()
  const [message, setMessage] = useState<string>()

  return (
    <div className="flex flex-col gap-xl">
      <p className="text-body-sm text-ink-muted">
        Pedidos da empresa acima de{" "}
        {brl.format(Number(approvals.approvalLimit))} só seguem para pagamento
        depois da decisão de um aprovador diferente do solicitante.
      </p>
      {message && (
        <p role="status" className="rounded bg-primary-tint p-sm text-body-sm">
          {message}
        </p>
      )}
      <section aria-labelledby="pendentes" className="flex flex-col gap-md">
        <h2 id="pendentes" className="text-headline-md">
          Aguardando decisão
        </h2>
        {approvals.pending.length === 0 ? (
          <p className="rounded-lg bg-subtle p-lg text-body text-ink-muted">
            Nenhum pedido aguardando aprovação.
          </p>
        ) : (
          <ul className="flex flex-col gap-md">
            {approvals.pending.map((order) => (
              <PendingCard
                key={order.orderId}
                order={order}
                onDecided={(text) => {
                  setMessage(text)
                  router.refresh()
                }}
              />
            ))}
          </ul>
        )}
      </section>
      <section aria-labelledby="historico" className="flex flex-col gap-md">
        <h2 id="historico" className="text-headline-md">
          Decisões recentes
        </h2>
        {approvals.history.length === 0 ? (
          <p className="text-body text-ink-muted">
            Nenhuma decisão registrada ainda.
          </p>
        ) : (
          <HistoryTable history={approvals.history} />
        )}
      </section>
    </div>
  )
}
