"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { zodResolver } from "@hookform/resolvers/zod"
import { useForm, useWatch } from "react-hook-form"
import { Button } from "@/components/ui/button"
import { FormField, fieldAria } from "@/components/ui/form-field"
import {
  downloadSupportDeskAttachment,
  updateSupportTicket,
} from "@/features/after-sales/support-desk/action/support-desk-actions"
import {
  supportTicketUpdateSchema,
  type SupportTicketUpdateData,
  type SupportTicketUpdateInput,
} from "@/features/after-sales/support-desk/schema/support-desk-schema"
import { AttachmentPicker } from "@/features/shared/components/attachment-picker"
import {
  TicketFiles,
  TicketStatusBadge,
  TicketTimeline,
} from "@/features/shared/components/support-ticket-parts"
import { saveDownloadedFile } from "@/features/shared/lib/quotes/save-download"
import type { TicketDetail } from "@/features/shared/lib/support/ticket-detail"
import {
  formatTicketDate,
  isFinalTicketStatus,
  nextTicketStatuses,
  requiresResolution,
  TICKET_KIND_LABEL,
  TICKET_STATUS,
} from "@/features/shared/lib/support/ticket-status"

const shortDate = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeZone: "America/Sao_Paulo",
})

/**
 * Ticket desk of the back office (RF17): customer, order and item, the
 * estimated warranty coverage as a reference for the evaluation, the
 * problem, files and timeline, and the answer form with the next
 * statuses the ticket may take.
 *
 * @param props - Ticket detail.
 * @returns The desk.
 */
export function SupportDeskView({ ticket }: { ticket: TicketDetail }) {
  const router = useRouter()
  const [files, setFiles] = useState<File[]>([])
  const [error, setError] = useState<string>()
  const [notice, setNotice] = useState<string>()
  const [pending, startTransition] = useTransition()
  const form = useForm<
    SupportTicketUpdateInput,
    unknown,
    SupportTicketUpdateData
  >({
    resolver: zodResolver(supportTicketUpdateSchema),
    defaultValues: {
      ticketId: ticket.id,
      status: "",
      message: "",
      resolution: "",
    },
  })
  const status = useWatch({ control: form.control, name: "status" })
  const errors = form.formState.errors
  const final = isFinalTicketStatus(ticket.status)

  const download = (attachmentId: string) =>
    startTransition(async () => {
      setError(undefined)
      const result = await downloadSupportDeskAttachment({ attachmentId })
      if (!result.success) return setError(result.error)
      saveDownloadedFile(result.file)
    })

  const onSubmit = form.handleSubmit((values) =>
    startTransition(async () => {
      setError(undefined)
      setNotice(undefined)
      const data = new FormData()
      data.set("payload", JSON.stringify(values))
      for (const file of files) data.append("attachments", file)
      const result = await updateSupportTicket(data)
      if (!result.success) return setError(result.error)
      form.reset({
        ticketId: ticket.id,
        status: "",
        message: "",
        resolution: "",
      })
      setFiles([])
      setNotice("Resposta registrada. O cliente recebe um e-mail.")
      router.refresh()
    })
  )

  return (
    <div className="grid gap-xl lg:grid-cols-[1fr_22rem]">
      <div className="flex flex-col gap-lg">
        <section aria-labelledby="problema" className="flex flex-col gap-sm">
          <div className="flex flex-wrap items-center gap-sm">
            <h2 id="problema" className="text-headline-sm">
              {ticket.subject}
            </h2>
            <TicketStatusBadge status={ticket.status} />
          </div>
          <p className="text-body whitespace-pre-line">{ticket.description}</p>
          {ticket.resolution && (
            <div className="rounded bg-subtle p-md">
              <p className="text-label">Resultado da avaliação</p>
              <p className="text-body whitespace-pre-line">
                {ticket.resolution}
              </p>
            </div>
          )}
        </section>
        <section aria-labelledby="arquivos" className="flex flex-col gap-sm">
          <h2 id="arquivos" className="text-headline-sm">
            Fotos e documentos
          </h2>
          <TicketFiles
            files={ticket.files}
            onDownload={download}
            pending={pending}
          />
        </section>
        <section aria-labelledby="historico" className="flex flex-col gap-sm">
          <h2 id="historico" className="text-headline-sm">
            Histórico
          </h2>
          <TicketTimeline entries={ticket.timeline} />
        </section>

        {final ? (
          <p className="text-body-sm text-ink-muted">
            Chamado encerrado
            {ticket.closedAt ? ` em ${formatTicketDate(ticket.closedAt)}` : ""}.
          </p>
        ) : (
          <form
            onSubmit={onSubmit}
            noValidate
            aria-labelledby="responder"
            className="flex flex-col gap-md rounded-lg border border-line-subtle p-md"
          >
            <h2 id="responder" className="text-headline-sm">
              Responder ao cliente
            </h2>
            <FormField
              id="desk-status"
              label="Nova situação"
              error={errors.status?.message}
            >
              <select
                id="desk-status"
                className="h-11 rounded border border-line bg-canvas px-md text-body"
                {...fieldAria("desk-status", errors.status?.message)}
                {...form.register("status")}
              >
                <option value="">
                  Manter “{TICKET_STATUS[ticket.status].label}”
                </option>
                {nextTicketStatuses(ticket.status).map((option) => (
                  <option key={option} value={option}>
                    {TICKET_STATUS[option].label}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField
              id="desk-message"
              label="Mensagem ao cliente"
              error={errors.message?.message}
              hint="Aparece no histórico do chamado e no e-mail."
            >
              <textarea
                id="desk-message"
                rows={4}
                className="rounded border border-line bg-canvas p-md text-body"
                {...fieldAria("desk-message", errors.message?.message)}
                {...form.register("message")}
              />
            </FormField>
            {status && requiresResolution(status) && (
              <FormField
                id="desk-resolution"
                label="Resultado da avaliação (laudo)"
                error={errors.resolution?.message}
                hint="Troca, reparo, reembolso ou o motivo da recusa, com base nas condições da garantia."
              >
                <textarea
                  id="desk-resolution"
                  rows={4}
                  className="rounded border border-line bg-canvas p-md text-body"
                  {...fieldAria("desk-resolution", errors.resolution?.message)}
                  {...form.register("resolution")}
                />
              </FormField>
            )}
            <AttachmentPicker
              id="desk-files"
              label="Arquivos para o cliente (opcional)"
              files={files}
              onChange={setFiles}
            />
            {error && (
              <p role="alert" className="text-body-sm text-error">
                {error}
              </p>
            )}
            {notice && (
              <p role="status" className="text-body-sm text-ink">
                {notice}
              </p>
            )}
            <Button type="submit" className="self-start" disabled={pending}>
              {pending ? "Salvando…" : "Registrar resposta"}
            </Button>
          </form>
        )}
      </div>

      <aside
        aria-label="Dados do chamado"
        className="flex flex-col gap-md rounded-lg bg-subtle p-md text-body-sm"
      >
        <dl className="flex flex-col gap-sm">
          <div>
            <dt className="text-ink-muted">Tipo</dt>
            <dd>{TICKET_KIND_LABEL[ticket.kind]}</dd>
          </div>
          <div>
            <dt className="text-ink-muted">Cliente</dt>
            <dd>
              {ticket.customer.name}
              <span className="block break-all">{ticket.customer.email}</span>
            </dd>
          </div>
          <div>
            <dt className="text-ink-muted">Pedido</dt>
            <dd>{ticket.order.number}</dd>
          </div>
          <div>
            <dt className="text-ink-muted">Produto</dt>
            <dd>
              {ticket.item.name} ({ticket.item.skuCode}) ·{" "}
              {ticket.item.quantity}{" "}
              {ticket.item.quantity === 1 ? "unidade" : "unidades"}
            </dd>
          </div>
          <div>
            <dt className="text-ink-muted">Entregue em</dt>
            <dd>
              {ticket.order.deliveredAt
                ? shortDate.format(new Date(ticket.order.deliveredAt))
                : "Sem data registrada"}
            </dd>
          </div>
          <div>
            <dt className="text-ink-muted">Garantia estimada até</dt>
            <dd>
              {ticket.coverageUntil
                ? shortDate.format(new Date(ticket.coverageUntil))
                : "Sem data de entrega"}
              {ticket.openedWithinCoverage === false && (
                <span className="block text-error">
                  Aberto depois do prazo estimado. Confira se é defeito oculto.
                </span>
              )}
            </dd>
          </div>
          <div>
            <dt className="text-ink-muted">Aberto em</dt>
            <dd>{formatTicketDate(ticket.createdAt)}</dd>
          </div>
        </dl>
        <p className="text-ink-muted">
          A estimativa soma a garantia legal de 90 dias à garantia contratual do
          produto. A avaliação técnica confirma a cobertura.
        </p>
      </aside>
    </div>
  )
}
