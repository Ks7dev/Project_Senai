"use client"

import { useState, useTransition } from "react"
import Link from "next/link"
import { Button, buttonVariants } from "@/components/ui/button"
import { FormField } from "@/components/ui/form-field"
import { importProducts } from "@/features/catalog/products-admin/action/import-products"
import {
  IMPORT_COLUMNS,
  MAX_IMPORT_ROWS,
  type ImportReport,
} from "@/features/catalog/products-admin/schema/import-schema"

/**
 * Product CSV import (#29, RF48): template download, upload and the
 * report with created, updated and per-line errors.
 *
 * @returns The import page content.
 */
export function ImportView() {
  const [report, setReport] = useState<ImportReport>()
  const [error, setError] = useState<string>()
  const [pending, startTransition] = useTransition()

  return (
    <div className="flex flex-col gap-lg">
      <section className="flex flex-col gap-sm rounded-lg bg-subtle p-lg">
        <h2 className="text-headline-sm">1. Baixe o modelo</h2>
        <p className="text-body-sm text-ink-muted">
          Uma linha por produto, separada por ponto e vírgula. Colunas:{" "}
          {IMPORT_COLUMNS.join(", ")}. Até {MAX_IMPORT_ROWS} linhas e 2 MB.
          Produtos com o mesmo slug são atualizados; os novos entram como
          rascunho e são publicados depois de conferidos.
        </p>
        <a
          href="/admin/produtos/importar/modelo"
          className={buttonVariants({ variant: "ghost", size: "sm" })}
          download
        >
          Baixar modelo CSV
        </a>
      </section>

      <form
        className="flex flex-col gap-sm rounded-lg border border-line-subtle bg-elevated p-lg"
        action={(formData) =>
          startTransition(async () => {
            setError(undefined)
            setReport(undefined)
            const result = await importProducts(formData)
            if (!result.success) return setError(result.error)
            setReport(result.report)
          })
        }
      >
        <h2 className="text-headline-sm">2. Envie o arquivo preenchido</h2>
        <FormField id="csv-file" label="Arquivo CSV">
          <input
            id="csv-file"
            name="file"
            type="file"
            required
            accept=".csv,text/csv"
            className="text-body-sm"
          />
        </FormField>
        <Button type="submit" disabled={pending} className="self-start">
          {pending ? "Importando…" : "Importar produtos"}
        </Button>
      </form>

      {error && (
        <p
          role="alert"
          className="rounded bg-error-tint p-sm text-body-sm text-error"
        >
          {error}
        </p>
      )}

      {report && (
        <section aria-labelledby="relatorio" className="flex flex-col gap-md">
          <h2 id="relatorio" className="text-headline-md">
            Relatório da importação
          </h2>
          <p role="status" className="text-body">
            {report.created} criado(s), {report.updated} atualizado(s),{" "}
            {report.errors.length} linha(s) com erro.
          </p>
          {report.errors.length > 0 && (
            <div className="overflow-x-auto rounded-lg border border-line-subtle">
              <table className="w-full text-left text-body-sm">
                <caption className="sr-only">Linhas com erro</caption>
                <thead className="bg-subtle text-label">
                  <tr>
                    <th scope="col" className="w-24 p-sm">
                      Linha
                    </th>
                    <th scope="col" className="p-sm">
                      Problema
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {report.errors.map((item) => (
                    <tr key={item.line} className="border-t border-line-subtle">
                      <td className="p-sm">{item.line}</td>
                      <td className="p-sm text-error">{item.message}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <Link
            href="/admin/produtos?status=DRAFT"
            className="text-body-sm text-primary underline"
          >
            Ver produtos em rascunho
          </Link>
        </section>
      )}
    </div>
  )
}
