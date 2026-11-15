"use client"

import { useState, useTransition } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { zodResolver } from "@hookform/resolvers/zod"
import { useForm } from "react-hook-form"
import { Button } from "@/components/ui/button"
import { FormField, fieldAria } from "@/components/ui/form-field"
import {
  downloadMySupportAttachment,
  replyToSupportTicket,
} from "@/features/after-sales/support-tickets/action/support-ticket-actions"
import {
  ticketReplySchema,
  type TicketReplyData,
  type TicketReplyInput,
} from "@/features/after-sales/support-tickets/schema/support-ticket-schema"
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
  TICKET_KIND_LABEL,
  TICKET_STATUS,
} from "@/features/shared/lib/support/ticket-status"

/**
 * Ticket followed by the customer (RF17): status and what it means,
 * order and item, the problem, the outcome of the evaluation, the
 * timeline with the messages of the team, the files and, while the
 * ticket is open, a form to answer with new photos.
 *
 * @param props - Ticket detail and whether it was just opened.
 * @returns The ticket.
 */
export function SupportTicketDetailView({
  ticket,
  justOpened,
}: {
  ticket: TicketDetail
  justOpened: boolean
}) {
  const router = useRouter()
  const [files, setFiles] = useState<File[]>([])
  const [error, setError] = useState<string>()
  const [downloadError, setDownloadError] = useState<string>()
  const [pending, startTransition] = useTransition()
  const form = useForm<TicketReplyInput, unknown, TicketReplyData>({
    resolver: zodResolver(ticketReplySchema),
    defaultValues: { ticketId: ticket.id, message: "" },
  })
  const status = TICKET_STATUS[ticket.status]
  const final = isFinalTicketStatus(ticket.status)

  const download = (attachmentId: string) =>
    startTransition(async () => {
      setDownloadError(undefined)
      const result = await downloadMySupportAttachment({ attachmentId })
      if (!result.success) return setDownloadError(result.error)
      saveDownloadedFile(result.file)
    })

  const onReply = form.handleSubmit((values) =>
    startTransition(async () => {
      setError(undefined)
      const data = new FormData()
      data.set("payload", JSON.stringify(values))
      for (const file of files) data.append("attachments", file)
      const result = await replyToSupportTicket(data)
      if (!result.success) return setError(result.error)
      form.reset({ ticketId: ticket.id, message: "" })
      setFiles([])
      router.refresh()
    })
  )

  return (
    <div className="flex flex-col gap-lg">
      {justOpened && (
        <p role="status" className="rounded bg-primary-tint p-md text-body">
          Chamado {ticket.number} aberto. Você recebe um e-mail a cada
          atualização e acompanha tudo por esta página.
        </p>
      )}

      <section
        aria-labelledby="situacao"
        className="flex flex-col gap-sm rounded-lg border border-line-subtle p-md"
      >
        <div className="flex flex-wrap items-center gap-sm">
          <h2 id="situacao" className="text-headline-sm">
            Situação
          </h2>
          <TicketStatusBadge status={ticket.status} />
        </div>
        <p className="text-body text-ink-muted">{status.description}</p>
        {ticket.resolution && (
          <div className="rounded bg-subtle p-md">
            <p className="text-label">Resultado da avaliação</p>
            <p className="text-body whitespace-pre-line">{ticket.resolution}</p>
          </div>
        )}
      </section>

      <section aria-labelledby="dados" className="flex flex-col gap-sm">
        <h2 id="dados" className="text-headline-sm">
          Dados do chamado
        </h2>
        <dl className="grid gap-sm text-body-sm sm:grid-cols-2">
          <div>
            <dt className="text-ink-muted">Tipo</dt>
            <dd>{TICKET_KIND_LABEL[ticket.kind]}</dd>
          </div>
          <div>
            <dt className="text-ink-muted">Aberto em</dt>
            <dd>{formatTicketDate(ticket.createdAt)}</dd>
          </div>
          <div>
            <dt className="text-ink-muted">Pedido</dt>
            <dd>
              <Link
                href={`/conta/pedidos/${ticket.order.id}`}
                className="text-primary underline"
              >
                {ticket.order.number}
              </Link>
            </dd>
          </div>
          <div>
            <dt className="text-ink-muted">Produto</dt>
            <dd>
              {ticket.item.name} ({ticket.item.skuCode})
            </dd>
          </div>
        </dl>
        <h3 className="text-subhead">{ticket.subject}</h3>
        <p className="text-body whitespace-pre-line">{ticket.description}</p>
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
        {downloadError && (
          <p role="alert" className="text-body-sm text-error">
            {downloadError}
          </p>
        )}
      </section>

      <section aria-labelledby="historico" className="flex flex-col gap-sm">
        <h2 id="historico" className="text-headline-sm">
          Histórico
        </h2>
        <TicketTimeline entries={ticket.timeline} />
      </section>

      {final ? (
        <p className="text-body-sm text-ink-muted">
          Este chamado foi encerrado. Se o problema voltar, abra um novo
          chamado.
        </p>
      ) : (
        <form
          onSubmit={onReply}
          noValidate
          aria-labelledby="responder"
          className="flex flex-col gap-md"
        >
          <h2 id="responder" className="text-headline-sm">
            Enviar mensagem à equipe
          </h2>
          <FormField
            id="reply-message"
            label="Mensagem"
            error={form.formState.errors.message?.message}
          >
            <textarea
              id="reply-message"
              rows={4}
              className="rounded border border-line bg-canvas p-md text-body"
              {...fieldAria(
                "reply-message",
                form.formState.errors.message?.message
              )}
              {...form.register("message")}
            />
          </FormField>
          <AttachmentPicker
            id="reply-files"
            label="Novas fotos ou documentos (opcional)"
            files={files}
            onChange={setFiles}
          />
          {error && (
            <p role="alert" className="text-body-sm text-error">
              {error}
            </p>
          )}
          <Button type="submit" className="self-start" disabled={pending}>
            {pending ? "Enviando…" : "Enviar mensagem"}
          </Button>
        </form>
      )}
    </div>
  )
}
