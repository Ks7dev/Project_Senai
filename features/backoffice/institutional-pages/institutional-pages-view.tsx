"use client"

import { useId, useState, useTransition } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { zodResolver } from "@hookform/resolvers/zod"
import { ExternalLinkIcon } from "lucide-react"
import { useForm, useWatch } from "react-hook-form"
import { Button } from "@/components/ui/button"
import { FormField, fieldAria } from "@/components/ui/form-field"
import { Input } from "@/components/ui/input"
import { saveInstitutionalPage } from "@/features/backoffice/institutional-pages/action/institutional-page-actions"
import {
  institutionalPageSchema,
  type InstitutionalPageInput,
} from "@/features/backoffice/institutional-pages/schema/institutional-page-schema"
import { RichText } from "@/features/shared/components/rich-text"
import {
  INSTITUTIONAL_TITLES,
  type InstitutionalPageContent,
  type InstitutionalSlug,
} from "@/features/shared/lib/content/institutional-pages"

const updatedFormat = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "America/Sao_Paulo",
})

/**
 * Back office editor of the institutional pages (#74, RF57): terms of
 * use, privacy policy, exchanges and returns, warranty. Saving takes
 * effect in the store without a deploy.
 *
 * @param props - The four pages.
 * @returns The editor.
 */
export function InstitutionalPagesView({
  pages,
}: {
  pages: InstitutionalPageContent[]
}) {
  const id = useId()
  const router = useRouter()
  const [slug, setSlug] = useState<InstitutionalSlug>(pages[0].slug)
  const [preview, setPreview] = useState(false)
  const [message, setMessage] = useState<string>()
  const [error, setError] = useState<string>()
  const [pending, startTransition] = useTransition()
  const current = pages.find((page) => page.slug === slug) ?? pages[0]
  const form = useForm<InstitutionalPageInput>({
    resolver: zodResolver(institutionalPageSchema),
    values: { slug: current.slug, title: current.title, body: current.body },
  })
  const body = useWatch({ control: form.control, name: "body" })
  const errors = form.formState.errors

  const onSubmit = form.handleSubmit((values) =>
    startTransition(async () => {
      setError(undefined)
      setMessage(undefined)
      const result = await saveInstitutionalPage(values)
      if (!result.success) return setError(result.error)
      setMessage("Página salva. A loja já mostra o novo texto.")
      router.refresh()
    })
  )

  return (
    <div className="flex flex-col gap-lg">
      <div
        role="tablist"
        aria-label="Páginas institucionais"
        className="flex flex-wrap gap-xs"
      >
        {pages.map((page) => (
          <Button
            key={page.slug}
            type="button"
            role="tab"
            aria-selected={page.slug === slug}
            variant={page.slug === slug ? "default" : "ghost"}
            size="sm"
            disabled={pending}
            onClick={() => {
              setSlug(page.slug)
              setPreview(false)
              setMessage(undefined)
              setError(undefined)
            }}
          >
            {INSTITUTIONAL_TITLES[page.slug]}
          </Button>
        ))}
      </div>

      <form
        onSubmit={onSubmit}
        noValidate
        className="flex flex-col gap-md rounded-lg border border-line-subtle bg-elevated p-lg"
      >
        <div className="flex flex-wrap items-center justify-between gap-sm text-body-sm text-ink-muted">
          <span>
            {current.updatedAt
              ? `Última alteração em ${updatedFormat.format(new Date(current.updatedAt))}.`
              : "Ainda não publicada."}
          </span>
          <Link
            href={`/${current.slug}`}
            target="_blank"
            className="inline-flex items-center gap-xs text-primary underline"
          >
            Ver na loja <ExternalLinkIcon className="size-4" aria-hidden />
            <span className="sr-only">(abre em nova aba)</span>
          </Link>
        </div>
        <FormField
          id={`${id}-title`}
          label="Título"
          error={errors.title?.message}
        >
          <Input
            id={`${id}-title`}
            {...fieldAria(`${id}-title`, errors.title?.message)}
            {...form.register("title")}
          />
        </FormField>
        <FormField
          id={`${id}-body`}
          label="Texto"
          error={errors.body?.message}
          hint="Use ## para títulos, ### para subtítulos, - para listas, | para tabelas e **texto** para negrito. Linha em branco separa parágrafos."
        >
          <textarea
            id={`${id}-body`}
            rows={20}
            className="min-h-64 rounded border border-line bg-canvas p-md font-mono text-body-sm text-ink focus-visible:border-primary focus-visible:ring-3 focus-visible:ring-primary/12 focus-visible:outline-none"
            {...fieldAria(`${id}-body`, errors.body?.message)}
            {...form.register("body")}
          />
        </FormField>
        <div className="flex flex-wrap gap-sm">
          <Button type="submit" disabled={pending}>
            {pending ? "Salvando…" : "Salvar página"}
          </Button>
          <Button
            type="button"
            variant="ghost"
            aria-expanded={preview}
            onClick={() => setPreview((value) => !value)}
          >
            {preview ? "Ocultar prévia" : "Ver prévia"}
          </Button>
        </div>
        {message && (
          <p role="status" className="text-body-sm text-primary">
            {message}
          </p>
        )}
        {error && (
          <p role="alert" className="text-body-sm text-error">
            {error}
          </p>
        )}
      </form>

      {preview && (
        <section
          aria-label="Prévia da página"
          className="rounded-lg border border-line-subtle p-lg"
        >
          <RichText source={body ?? ""} />
        </section>
      )}
    </div>
  )
}
