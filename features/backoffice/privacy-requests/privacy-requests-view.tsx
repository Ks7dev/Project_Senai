"use client"

import { useId, useState, useTransition } from "react"
import { zodResolver } from "@hookform/resolvers/zod"
import { DownloadIcon, SearchIcon, UserXIcon } from "lucide-react"
import { useForm } from "react-hook-form"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { FormField, fieldAria } from "@/components/ui/form-field"
import { Input } from "@/components/ui/input"
import {
  anonymizeSubject,
  exportSubjectData,
  findPrivacySubjects,
  type PrivacySubject,
} from "@/features/backoffice/privacy-requests/action/privacy-request-actions"
import {
  ANONYMIZE_PHRASE,
  privacyAnonymizeSchema,
  privacyLookupSchema,
  type PrivacyAnonymizeInput,
  type PrivacyLookupInput,
} from "@/features/backoffice/privacy-requests/schema/privacy-request-schema"
import { saveDownloadedFile } from "@/features/shared/lib/quotes/save-download"

/**
 * Back office LGPD module (#75, RF56): finds a titular by e-mail or
 * CPF/CNPJ to answer requests received by the service channel, exports
 * their data and anonymizes the account without breaking orders and
 * invoices.
 *
 * @returns The module.
 */
export function PrivacyRequestsView() {
  const id = useId()
  const [subjects, setSubjects] = useState<PrivacySubject[] | null>(null)
  const [error, setError] = useState<string>()
  const [message, setMessage] = useState<string>()
  const [pending, startTransition] = useTransition()
  const form = useForm<PrivacyLookupInput>({
    resolver: zodResolver(privacyLookupSchema),
    defaultValues: { query: "" },
  })
  const fieldError = form.formState.errors.query?.message

  const search = (values: PrivacyLookupInput) =>
    startTransition(async () => {
      setError(undefined)
      const result = await findPrivacySubjects(values)
      if (!result.success) return setError(result.error)
      setSubjects(result.subjects)
    })

  const download = (subject: PrivacySubject) =>
    startTransition(async () => {
      setError(undefined)
      setMessage(undefined)
      const result = await exportSubjectData({ userId: subject.id })
      if (!result.success) return setError(result.error)
      saveDownloadedFile(result.file)
      setMessage("Arquivo do titular gerado.")
    })

  return (
    <div className="flex flex-col gap-xl">
      <p className="max-w-2xl text-body text-ink-muted">
        Use este módulo para atender pedidos de titulares recebidos pelo
        atendimento. O próprio cliente também exporta e exclui os dados em Minha
        conta › Privacidade. A anonimização mantém pedidos e notas fiscais, que
        têm guarda legal.
      </p>
      <form
        onSubmit={form.handleSubmit(search)}
        noValidate
        className="flex flex-wrap items-end gap-sm"
      >
        <FormField
          id={`${id}-query`}
          label="E-mail ou CPF/CNPJ do titular"
          error={fieldError}
          className="min-w-64 flex-1"
        >
          <Input
            id={`${id}-query`}
            autoComplete="off"
            {...fieldAria(`${id}-query`, fieldError)}
            {...form.register("query")}
          />
        </FormField>
        <Button type="submit" disabled={pending}>
          <SearchIcon aria-hidden /> Buscar
        </Button>
      </form>

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

      {subjects && subjects.length === 0 && (
        <p className="text-body text-ink-muted">Nenhum titular encontrado.</p>
      )}
      {subjects && subjects.length > 0 && (
        <ul className="flex flex-col gap-md">
          {subjects.map((subject) => (
            <li
              key={subject.id}
              className="flex flex-col gap-sm rounded-lg border border-line-subtle p-md"
            >
              <div className="flex flex-wrap items-center gap-sm">
                <h2 className="flex-1 text-headline-sm">{subject.name}</h2>
                <Badge variant="secondary">
                  {subject.personType === "PJ"
                    ? "Pessoa jurídica"
                    : "Pessoa física"}
                </Badge>
                {subject.anonymizedAt && (
                  <Badge variant="outline">Anonimizado</Badge>
                )}
              </div>
              <p className="text-body-sm text-ink-muted">
                {subject.email} · {subject.orders}{" "}
                {subject.orders === 1 ? "pedido" : "pedidos"}
                {subject.openOrders > 0 &&
                  ` · ${subject.openOrders} em andamento`}
              </p>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="self-start"
                disabled={pending}
                onClick={() => download(subject)}
              >
                <DownloadIcon aria-hidden /> Exportar dados
              </Button>
              {!subject.anonymizedAt && (
                <AnonymizeForm
                  subject={subject}
                  onDone={() => {
                    setMessage("Titular anonimizado.")
                    setSubjects(
                      (current) =>
                        current?.map((item) =>
                          item.id === subject.id
                            ? {
                                ...item,
                                name: "Titular anonimizado",
                                anonymizedAt: new Date().toISOString(),
                              }
                            : item
                        ) ?? null
                    )
                  }}
                />
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/**
 * Anonymization of one titular, with the protocol of the request and
 * the confirmation phrase.
 *
 * @param props - Titular and the success handler.
 * @returns The form.
 */
function AnonymizeForm({
  subject,
  onDone,
}: {
  subject: PrivacySubject
  onDone: () => void
}) {
  const id = useId()
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string>()
  const [pending, startTransition] = useTransition()
  const form = useForm<PrivacyAnonymizeInput>({
    resolver: zodResolver(privacyAnonymizeSchema),
    defaultValues: { userId: subject.id, protocol: "", confirmation: "" },
  })
  const errors = form.formState.errors

  if (!open) {
    return (
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="self-start"
        onClick={() => setOpen(true)}
      >
        <UserXIcon aria-hidden /> Anonimizar
      </Button>
    )
  }

  return (
    <form
      onSubmit={form.handleSubmit((values) =>
        startTransition(async () => {
          setError(undefined)
          const result = await anonymizeSubject(values)
          if (!result.success) return setError(result.error)
          onDone()
        })
      )}
      noValidate
      className="flex flex-col gap-sm rounded bg-subtle p-md"
    >
      <p className="text-body-sm text-ink">
        A anonimização não pode ser desfeita. Pedidos e notas fiscais são
        mantidos.
      </p>
      <div className="grid gap-sm md:grid-cols-2">
        <FormField
          id={`${id}-protocol`}
          label="Protocolo ou origem da solicitação"
          error={errors.protocol?.message}
        >
          <Input
            id={`${id}-protocol`}
            {...fieldAria(`${id}-protocol`, errors.protocol?.message)}
            {...form.register("protocol")}
          />
        </FormField>
        <FormField
          id={`${id}-confirmation`}
          label={`Digite ${ANONYMIZE_PHRASE} para confirmar`}
          error={errors.confirmation?.message}
        >
          <Input
            id={`${id}-confirmation`}
            autoComplete="off"
            {...fieldAria(`${id}-confirmation`, errors.confirmation?.message)}
            {...form.register("confirmation")}
          />
        </FormField>
      </div>
      {error && (
        <p role="alert" className="text-body-sm text-error">
          {error}
        </p>
      )}
      <div className="flex flex-wrap gap-sm">
        <Button type="submit" variant="destructive" disabled={pending}>
          Anonimizar titular
        </Button>
        <Button
          type="button"
          variant="ghost"
          disabled={pending}
          onClick={() => setOpen(false)}
        >
          Cancelar
        </Button>
      </div>
    </form>
  )
}
