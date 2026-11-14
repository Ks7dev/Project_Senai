"use client"

import { useId, useState, useTransition } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { zodResolver } from "@hookform/resolvers/zod"
import { DownloadIcon, ShieldCheckIcon, UserXIcon } from "lucide-react"
import { useForm } from "react-hook-form"
import { Button } from "@/components/ui/button"
import { FormField, fieldAria } from "@/components/ui/form-field"
import { Input } from "@/components/ui/input"
import {
  deleteMyData,
  exportMyData,
} from "@/features/account/privacy/action/privacy-actions"
import {
  DELETION_PHRASE,
  deleteMyDataSchema,
  type DeleteMyDataInput,
} from "@/features/account/privacy/schema/privacy-schema"
import { CookiePreferencesButton } from "@/features/shared/components/cookie-consent"
import { saveDownloadedFile } from "@/features/shared/lib/quotes/save-download"

/**
 * Privacy area of the customer (#75, RF56): what the store does with
 * the data, the cookie preferences, the export of the personal data in
 * a readable file and the deletion by anonymization.
 *
 * @returns The privacy section.
 */
export function PrivacyView() {
  const id = useId()
  const router = useRouter()
  const [exportError, setExportError] = useState<string>()
  const [deleteError, setDeleteError] = useState<string>()
  const [exported, setExported] = useState(false)
  const [pending, startTransition] = useTransition()
  const form = useForm<DeleteMyDataInput>({
    resolver: zodResolver(deleteMyDataSchema),
    defaultValues: { password: "", confirmation: "" },
  })
  const errors = form.formState.errors

  const download = () =>
    startTransition(async () => {
      setExportError(undefined)
      setExported(false)
      const result = await exportMyData()
      if (!result.success) return setExportError(result.error)
      saveDownloadedFile(result.file)
      setExported(true)
    })

  const onDelete = form.handleSubmit((values) =>
    startTransition(async () => {
      setDeleteError(undefined)
      const result = await deleteMyData(values)
      if (!result.success) return setDeleteError(result.error)
      router.push("/?dados-excluidos=1")
      router.refresh()
    })
  )

  return (
    <div className="flex flex-col gap-xl">
      <section
        aria-labelledby={`${id}-use`}
        className="flex flex-col gap-sm rounded-lg bg-subtle p-lg"
      >
        <h2
          id={`${id}-use`}
          className="flex items-center gap-sm text-headline-sm"
        >
          <ShieldCheckIcon className="size-5 text-primary" aria-hidden />
          Como usamos os seus dados
        </h2>
        <p className="text-body-sm text-ink">
          Os seus dados são usados só para viabilizar a compra: cadastro,
          pedido, pagamento, entrega, nota fiscal, garantia e atendimento. São
          compartilhados apenas com os parceiros indispensáveis (pagamento,
          frete e emissão de nota fiscal). Detalhes na{" "}
          <Link
            href="/politica-de-privacidade"
            className="text-primary underline"
          >
            Política de privacidade
          </Link>
          .
        </p>
        <CookiePreferencesButton />
      </section>

      <section
        aria-labelledby={`${id}-export`}
        className="flex flex-col gap-sm"
      >
        <h2 id={`${id}-export`} className="text-headline-sm">
          Exportar meus dados
        </h2>
        <p className="text-body-sm text-ink-muted">
          Baixe um arquivo com o seu cadastro, endereços, pedidos, cotações,
          favoritos e acessos, com os campos identificados em português.
        </p>
        <Button
          type="button"
          variant="ghost"
          className="self-start"
          disabled={pending}
          onClick={download}
        >
          <DownloadIcon aria-hidden /> Baixar meus dados
        </Button>
        <p role="status" className="text-body-sm text-primary empty:hidden">
          {exported ? "Arquivo gerado." : ""}
        </p>
        {exportError && (
          <p role="alert" className="text-body-sm text-error">
            {exportError}
          </p>
        )}
      </section>

      <form
        onSubmit={onDelete}
        noValidate
        aria-labelledby={`${id}-delete`}
        className="flex flex-col gap-md rounded-lg border border-line-subtle p-lg"
      >
        <h2
          id={`${id}-delete`}
          className="flex items-center gap-sm text-headline-sm"
        >
          <UserXIcon className="size-5 text-error" aria-hidden />
          Excluir meus dados
        </h2>
        <ul className="flex list-disc flex-col gap-xs pl-lg text-body-sm text-ink">
          <li>
            Nome, e-mail, CPF ou CNPJ, telefone e endereços são anonimizados e
            você não consegue mais entrar com esta conta.
          </li>
          <li>
            Pedidos e notas fiscais são mantidos pelo prazo legal, sem ligação
            com um cadastro ativo.
          </li>
          <li>
            Com pedidos em andamento, a exclusão fica disponível depois da
            entrega ou do cancelamento.
          </li>
          <li>Esta ação não pode ser desfeita.</li>
        </ul>
        <div className="grid gap-md md:grid-cols-2">
          <FormField
            id={`${id}-password`}
            label="Senha atual"
            error={errors.password?.message}
          >
            <Input
              id={`${id}-password`}
              type="password"
              autoComplete="current-password"
              {...fieldAria(`${id}-password`, errors.password?.message)}
              {...form.register("password")}
            />
          </FormField>
          <FormField
            id={`${id}-confirmation`}
            label={`Digite ${DELETION_PHRASE} para confirmar`}
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
        {deleteError && (
          <p role="alert" className="text-body-sm text-error">
            {deleteError}
          </p>
        )}
        <Button
          type="submit"
          variant="destructive"
          className="self-start"
          disabled={pending}
        >
          {pending ? "Excluindo…" : "Excluir meus dados"}
        </Button>
      </form>
    </div>
  )
}
