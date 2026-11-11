"use client"

import { useState, useTransition } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { zodResolver } from "@hookform/resolvers/zod"
import { Trash2Icon } from "lucide-react"
import { useFieldArray, useForm, useWatch } from "react-hook-form"
import { Button, buttonVariants } from "@/components/ui/button"
import { FormField, fieldAria } from "@/components/ui/form-field"
import { Input } from "@/components/ui/input"
import {
  requestQuote,
  type QuoteRequestForm,
} from "@/features/cart/quote-request/action/quote-request-actions"
import {
  quoteAttachmentsSchema,
  quoteRequestSchema,
  type QuoteRequestData,
  type QuoteRequestInput,
} from "@/features/cart/quote-request/schema/quote-request-schema"
import {
  formatFileSize,
  MAX_QUOTE_ATTACHMENT_BYTES,
  MAX_QUOTE_ATTACHMENTS,
  MAX_QUOTE_ATTACHMENTS_TOTAL_BYTES,
  QUOTE_ATTACHMENT_ACCEPT,
  QUOTE_ATTACHMENT_FORMATS,
} from "@/features/shared/lib/quotes/quote-attachments"

const brl = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
})

/** Size limits shown next to the file input. */
const ATTACHMENT_HINT = `${QUOTE_ATTACHMENT_FORMATS}. Até ${MAX_QUOTE_ATTACHMENTS} arquivos, ${MAX_QUOTE_ATTACHMENT_BYTES / (1024 * 1024)} MB cada e ${MAX_QUOTE_ATTACHMENTS_TOTAL_BYTES / (1024 * 1024)} MB no total.`

/**
 * Quote request form (RF05, RF08): lines from the product page or the
 * cart, notes for the sales team and attached plans or specifications.
 * Prices shown are the current catalog reference; the sales team
 * answers with the final values.
 *
 * @param props - Lines the form starts with.
 * @returns The form, or an empty state.
 */
export function QuoteRequestView({
  form: initial,
}: {
  form: QuoteRequestForm
}) {
  const router = useRouter()
  const [files, setFiles] = useState<File[]>([])
  const [filesError, setFilesError] = useState<string>()
  const [error, setError] = useState<string>()
  const [pending, startTransition] = useTransition()
  const form = useForm<QuoteRequestInput, unknown, QuoteRequestData>({
    resolver: zodResolver(quoteRequestSchema),
    defaultValues: {
      lines: initial.lines.map((line) => ({
        skuId: line.skuId,
        quantity: line.quantity,
      })),
      notes: "",
    },
  })
  const lines = useFieldArray({ control: form.control, name: "lines" })
  const watched = useWatch({ control: form.control, name: "lines" })
  const errors = form.formState.errors

  if (initial.lines.length === 0) {
    return (
      <div className="flex flex-col items-start gap-md rounded-lg bg-subtle p-lg">
        <p className="text-body text-ink-muted">
          Escolha um produto e use “Solicitar cotação”, ou peça a cotação do
          carrinho inteiro.
        </p>
        <div className="flex flex-wrap gap-sm">
          <Link href="/busca" className={buttonVariants()}>
            Explorar produtos
          </Link>
          <Link
            href="/carrinho"
            className={buttonVariants({ variant: "ghost" })}
          >
            Ir ao carrinho
          </Link>
        </div>
      </div>
    )
  }

  const chooseFiles = (list: FileList | null) => {
    const chosen = [...files, ...Array.from(list ?? [])]
    const checked = quoteAttachmentsSchema.safeParse(
      chosen.map((file) => ({
        name: file.name,
        type: file.type,
        size: file.size,
      }))
    )
    if (!checked.success) {
      setFilesError(checked.error.issues[0]?.message)
      return
    }
    setFilesError(undefined)
    setFiles(chosen)
  }

  const onSubmit = form.handleSubmit((values) =>
    startTransition(async () => {
      setError(undefined)
      const data = new FormData()
      data.set("payload", JSON.stringify(values))
      for (const file of files) data.append("attachments", file)
      const result = await requestQuote(data)
      if (!result.success) return setError(result.error)
      router.push(`/conta/cotacoes/${result.quote.quoteId}?nova=1`)
    })
  )

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-lg">
      <section aria-labelledby="itens" className="flex flex-col gap-md">
        <h2 id="itens" className="text-headline-md">
          Itens da cotação
        </h2>
        {lines.fields.length === 0 && (
          <p className="text-body-sm text-ink-muted">
            Nenhum item. Volte ao produto ou ao carrinho para incluir itens.
          </p>
        )}
        <ul className="flex flex-col gap-md">
          {lines.fields.map((field, index) => {
            const line = initial.lines.find((item) =>
              item.variations.some(
                (variation) => variation.skuId === field.skuId
              )
            )
            if (!line) return null
            const prefix = `line-${index}`
            const skuError = errors.lines?.[index]?.skuId?.message
            const quantityError = errors.lines?.[index]?.quantity?.message
            const selected = line.variations.find(
              (variation) => variation.skuId === watched?.[index]?.skuId
            )
            return (
              <li
                key={field.id}
                className="grid gap-md rounded-lg border border-line-subtle p-md md:grid-cols-[1fr_12rem_8rem_auto] md:items-end"
              >
                <FormField
                  id={`${prefix}-sku`}
                  label={line.productName}
                  error={skuError}
                >
                  <select
                    id={`${prefix}-sku`}
                    className="h-11 rounded border border-line bg-canvas px-md text-body"
                    {...fieldAria(`${prefix}-sku`, skuError)}
                    {...form.register(`lines.${index}.skuId`)}
                  >
                    {line.variations.map((variation) => (
                      <option key={variation.skuId} value={variation.skuId}>
                        {variation.label}
                      </option>
                    ))}
                  </select>
                </FormField>
                <p className="text-body-sm text-ink-muted">
                  Preço de referência:{" "}
                  {selected ? brl.format(Number(selected.unitPrice)) : "—"}
                </p>
                <FormField
                  id={`${prefix}-quantity`}
                  label="Quantidade"
                  error={quantityError}
                >
                  <Input
                    id={`${prefix}-quantity`}
                    type="number"
                    inputMode="numeric"
                    min={1}
                    {...fieldAria(`${prefix}-quantity`, quantityError)}
                    {...form.register(`lines.${index}.quantity`, {
                      valueAsNumber: true,
                    })}
                  />
                </FormField>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`Remover ${line.productName} da cotação`}
                  onClick={() => lines.remove(index)}
                >
                  <Trash2Icon aria-hidden />
                </Button>
              </li>
            )
          })}
        </ul>
        {errors.lines?.message && (
          <p role="alert" className="text-body-sm text-error">
            {errors.lines.message}
          </p>
        )}
        {errors.lines?.root?.message && (
          <p role="alert" className="text-body-sm text-error">
            {errors.lines.root.message}
          </p>
        )}
        <p className="text-body-sm text-ink-muted">
          Os preços são do catálogo de hoje e servem de referência. A equipe
          comercial responde com os valores, o frete e as condições negociadas.
        </p>
      </section>

      <section aria-labelledby="detalhes" className="flex flex-col gap-md">
        <h2 id="detalhes" className="text-headline-md">
          Detalhes do projeto
        </h2>
        <FormField
          id="quote-notes"
          label="Observações para a equipe comercial (opcional)"
          error={errors.notes?.message}
          hint="Prazos desejados, local de entrega, personalizações ou dúvidas."
        >
          <textarea
            id="quote-notes"
            rows={5}
            className="rounded border border-line bg-canvas p-md text-body"
            {...fieldAria("quote-notes", errors.notes?.message)}
            {...form.register("notes")}
          />
        </FormField>
        <FormField
          id="quote-files"
          label="Anexos (opcional): planta do escritório, especificações"
          error={filesError}
          hint={ATTACHMENT_HINT}
        >
          <input
            id="quote-files"
            type="file"
            multiple
            accept={QUOTE_ATTACHMENT_ACCEPT}
            className="text-body-sm file:mr-md file:rounded file:border file:border-line file:bg-subtle file:px-md file:py-2"
            {...fieldAria("quote-files", filesError)}
            onChange={(event) => {
              chooseFiles(event.target.files)
              event.target.value = ""
            }}
          />
        </FormField>
        {files.length > 0 && (
          <ul className="flex flex-col gap-xs" aria-label="Arquivos anexados">
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
                  aria-label={`Remover o anexo ${file.name}`}
                  onClick={() =>
                    setFiles(files.filter((_, position) => position !== index))
                  }
                >
                  Remover
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {error && (
        <p role="alert" className="text-body-sm text-error">
          {error}
        </p>
      )}
      <Button
        type="submit"
        size="lg"
        className="self-start"
        disabled={pending || lines.fields.length === 0}
      >
        {pending ? "Enviando…" : "Enviar solicitação de cotação"}
      </Button>
    </form>
  )
}
