"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { FormField, fieldAria } from "@/components/ui/form-field"
import {
  formatFileSize,
  MAX_QUOTE_ATTACHMENT_BYTES,
  MAX_QUOTE_ATTACHMENTS,
  MAX_QUOTE_ATTACHMENTS_TOTAL_BYTES,
  QUOTE_ATTACHMENT_ACCEPT,
  QUOTE_ATTACHMENT_FORMATS,
} from "@/features/shared/lib/quotes/quote-attachments"
import { supportAttachmentsSchema } from "@/features/shared/schema/support-attachments-schema"

/** Size limits shown next to the file input. */
const ATTACHMENT_HINT = `${QUOTE_ATTACHMENT_FORMATS}. Até ${MAX_QUOTE_ATTACHMENTS} arquivos, ${MAX_QUOTE_ATTACHMENT_BYTES / (1024 * 1024)} MB cada e ${MAX_QUOTE_ATTACHMENTS_TOTAL_BYTES / (1024 * 1024)} MB no total.`

/**
 * File input of the after-sales forms (photos and documents of the
 * problem), with the chosen files listed and checked against the same
 * schema the Server Action uses.
 *
 * @param props - Field id, label, chosen files and the change handler.
 * @returns The field.
 */
export function AttachmentPicker({
  id,
  label,
  files,
  onChange,
}: {
  id: string
  label: string
  files: File[]
  onChange: (files: File[]) => void
}) {
  const [error, setError] = useState<string>()

  const choose = (list: FileList | null) => {
    const chosen = [...files, ...Array.from(list ?? [])]
    const checked = supportAttachmentsSchema.safeParse(
      chosen.map((file) => ({
        name: file.name,
        type: file.type,
        size: file.size,
      }))
    )
    if (!checked.success) {
      setError(checked.error.issues[0]?.message)
      return
    }
    setError(undefined)
    onChange(chosen)
  }

  return (
    <div className="flex flex-col gap-sm">
      <FormField id={id} label={label} error={error} hint={ATTACHMENT_HINT}>
        <input
          id={id}
          type="file"
          multiple
          accept={QUOTE_ATTACHMENT_ACCEPT}
          className="text-body-sm file:mr-md file:rounded file:border file:border-line file:bg-subtle file:px-md file:py-2"
          {...fieldAria(id, error)}
          onChange={(event) => {
            choose(event.target.files)
            event.target.value = ""
          }}
        />
      </FormField>
      {files.length > 0 && (
        <ul className="flex flex-col gap-xs" aria-label="Arquivos escolhidos">
          {files.map((file, index) => (
            <li
              key={`${file.name}-${index}`}
              className="flex flex-wrap items-center gap-sm text-body-sm"
            >
              <span className="min-w-0 flex-1 truncate">{file.name}</span>
              <span className="text-ink-muted">
                {formatFileSize(file.size)}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                aria-label={`Remover o arquivo ${file.name}`}
                onClick={() =>
                  onChange(files.filter((_, position) => position !== index))
                }
              >
                Remover
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
