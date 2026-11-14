"use client"

import { DownloadIcon, PaperclipIcon } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { formatFileSize } from "@/features/shared/lib/quotes/quote-attachments"
import type {
  TicketFile,
  TicketTimelineEntry,
} from "@/features/shared/lib/support/ticket-detail"
import {
  formatTicketDate,
  TICKET_STATUS,
  type TicketStatusKey,
} from "@/features/shared/lib/support/ticket-status"

/**
 * Badge with the status of an after-sales ticket (RF17).
 *
 * @param props - Ticket status.
 * @returns The badge.
 */
export function TicketStatusBadge({ status }: { status: TicketStatusKey }) {
  const { label, tone } = TICKET_STATUS[status]
  return (
    <Badge
      variant={
        tone === "problem"
          ? "destructive"
          : tone === "done"
            ? "default"
            : tone === "attention"
              ? "secondary"
              : "outline"
      }
    >
      {label}
    </Badge>
  )
}

/**
 * Timeline of a ticket: status changes and messages, oldest first.
 *
 * @param props - Timeline entries.
 * @returns The list.
 */
export function TicketTimeline({
  entries,
}: {
  entries: TicketTimelineEntry[]
}) {
  return (
    <ol className="flex flex-col gap-md border-l border-line-subtle pl-md">
      {entries.map((entry) => (
        <li key={entry.id} className="flex flex-col gap-xs">
          <p className="text-body-sm text-ink-muted">
            <time dateTime={entry.at}>{formatTicketDate(entry.at)}</time> ·{" "}
            {entry.author}
          </p>
          {entry.toStatus && (
            <p className="text-label text-ink">
              {entry.fromStatus
                ? `Situação alterada para “${TICKET_STATUS[entry.toStatus].label}”`
                : `Chamado ${TICKET_STATUS[entry.toStatus].label.toLowerCase()}`}
            </p>
          )}
          {entry.message && (
            <p className="text-body whitespace-pre-line text-ink">
              {entry.message}
            </p>
          )}
        </li>
      ))}
    </ol>
  )
}

/**
 * Photos and documents of a ticket, each with a download button.
 *
 * @param props - Files, the download handler and whether one runs.
 * @returns The list, or a short note when there are none.
 */
export function TicketFiles({
  files,
  onDownload,
  pending,
}: {
  files: TicketFile[]
  onDownload: (attachmentId: string) => void
  pending: boolean
}) {
  if (files.length === 0) {
    return (
      <p className="text-body-sm text-ink-muted">Nenhum arquivo anexado.</p>
    )
  }
  return (
    <ul className="flex flex-col gap-xs" aria-label="Arquivos do chamado">
      {files.map((file) => (
        <li
          key={file.id}
          className="flex flex-wrap items-center gap-sm text-body-sm"
        >
          <PaperclipIcon className="size-4 text-ink-muted" aria-hidden />
          <span className="min-w-0 flex-1 truncate">{file.name}</span>
          <span className="text-ink-muted">
            {formatFileSize(file.sizeBytes)}
            {file.fromTeam ? " · enviado pela equipe" : ""}
          </span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={pending}
            aria-label={`Baixar ${file.name}`}
            onClick={() => onDownload(file.id)}
          >
            <DownloadIcon aria-hidden /> Baixar
          </Button>
        </li>
      ))}
    </ul>
  )
}
