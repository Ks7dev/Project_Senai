"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { zodResolver } from "@hookform/resolvers/zod"
import { useForm } from "react-hook-form"
import { Badge } from "@/components/ui/badge"
import { Button, buttonVariants } from "@/components/ui/button"
import { FormField, fieldAria } from "@/components/ui/form-field"
import { Input } from "@/components/ui/input"
import {
  releaseExpiredReservations,
  restockSkuAction,
  type StockMovementRow,
  type StockRow,
} from "@/features/orders/stock/action/stock-actions"
import {
  restockSchema,
  type RestockData,
  type RestockInput,
} from "@/features/orders/stock/schema/stock-schema"

const dateTime = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "America/Sao_Paulo",
})

/**
 * Manual restock form of one SKU (RF43).
 *
 * @param props - SKU, cancel callback and success callback.
 * @returns The form.
 */
function RestockForm({
  row,
  onCancel,
  onDone,
}: {
  row: StockRow
  onCancel: () => void
  onDone: (message: string) => void
}) {
  const [error, setError] = useState<string>()
  const [pending, startTransition] = useTransition()
  const form = useForm<RestockInput, unknown, RestockData>({
    resolver: zodResolver(restockSchema),
    defaultValues: { skuId: row.skuId, quantity: "", note: "" },
  })
  const errors = form.formState.errors
  const prefix = `restock-${row.skuId}`

  const onSubmit = form.handleSubmit(() =>
    startTransition(async () => {
      setError(undefined)
      const result = await restockSkuAction(form.getValues())
      if (!result.success) return setError(result.error)
      onDone(
        `Reposição de ${row.code} registrada. Disponível agora: ${result.available}.`
      )
    })
  )

  return (
    <form
      onSubmit={onSubmit}
      noValidate
      className="flex flex-col gap-md rounded-lg border border-line-subtle bg-elevated p-md"
    >
      <div className="grid gap-md md:grid-cols-[10rem_1fr]">
        <FormField
          id={`${prefix}-quantity`}
          label="Unidades recebidas"
          error={errors.quantity?.message}
        >
          <Input
            id={`${prefix}-quantity`}
            inputMode="numeric"
            {...fieldAria(`${prefix}-quantity`, errors.quantity?.message)}
            {...form.register("quantity")}
          />
        </FormField>
        <FormField
          id={`${prefix}-note`}
          label="Motivo"
          hint="Ex.: nota fiscal do fornecedor ou inventário."
          error={errors.note?.message}
        >
          <Input
            id={`${prefix}-note`}
            {...fieldAria(`${prefix}-note`, errors.note?.message)}
            {...form.register("note")}
          />
        </FormField>
      </div>
      {error && (
        <p role="alert" className="text-body-sm text-error">
          {error}
        </p>
      )}
      <div className="flex flex-wrap gap-sm">
        <Button type="submit" disabled={pending}>
          {pending ? "Registrando…" : "Registrar reposição"}
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancelar
        </Button>
      </div>
    </form>
  )
}

type StockViewProps = {
  /** SKUs with their counters. */
  rows: StockRow[]
  /** Latest movements. */
  movements: StockMovementRow[]
  /** Current search text. */
  search: string
  /** Whether only unavailable SKUs are shown. */
  onlyUnavailable: boolean
  /** Whether the user may restock and release reservations. */
  canUpdate: boolean
}

/**
 * Back office stock screen (RF43, RF44, RN14): on hand, reserved and
 * available units by SKU, manual restock and the movement history.
 *
 * @param props - Rows, movements, filters and permission.
 * @returns The screen.
 */
export function StockView({
  rows,
  movements,
  search,
  onlyUnavailable,
  canUpdate,
}: StockViewProps) {
  const router = useRouter()
  const [editing, setEditing] = useState<string>()
  const [notice, setNotice] = useState<string>()
  const [error, setError] = useState<string>()
  const [releasing, startRelease] = useTransition()

  const done = (message: string) => {
    setEditing(undefined)
    setNotice(message)
    router.refresh()
  }

  const release = () =>
    startRelease(async () => {
      setNotice(undefined)
      setError(undefined)
      const result = await releaseExpiredReservations()
      if (!result.success) return setError(result.error)
      done(
        result.canceled === 0
          ? "Nenhum pedido com pagamento vencido."
          : `${result.canceled} pedido(s) com pagamento vencido cancelado(s) e reservas liberadas.`
      )
    })

  return (
    <div className="flex flex-col gap-lg">
      <div className="flex flex-wrap items-end gap-md">
        <form
          role="search"
          className="flex flex-1 flex-wrap items-end gap-sm"
          action="/admin/estoque"
        >
          <div className="flex min-w-60 flex-1 flex-col gap-xs">
            <label htmlFor="busca-estoque" className="text-label">
              Buscar por produto ou SKU
            </label>
            <Input id="busca-estoque" name="q" defaultValue={search} />
          </div>
          <label className="flex h-11 items-center gap-sm text-body">
            <input
              type="checkbox"
              name="sem-estoque"
              value="1"
              defaultChecked={onlyUnavailable}
              className="size-4"
            />
            Só sem estoque disponível
          </label>
          <button
            type="submit"
            className={buttonVariants({ variant: "ghost" })}
          >
            Filtrar
          </button>
        </form>
        {canUpdate && (
          <Button variant="ghost" onClick={release} disabled={releasing}>
            {releasing ? "Verificando…" : "Liberar reservas vencidas"}
          </Button>
        )}
      </div>

      <div aria-live="polite">
        {notice && <p className="text-body text-ink">{notice}</p>}
        {error && (
          <p role="alert" className="text-body text-error">
            {error}
          </p>
        )}
      </div>

      {rows.length === 0 ? (
        <p className="text-body text-ink-muted">Nenhum SKU encontrado.</p>
      ) : (
        <ul className="flex flex-col gap-sm">
          {rows.map((row) => (
            <li
              key={row.skuId}
              className="flex flex-col gap-sm rounded-lg border border-line-subtle p-md"
            >
              <div className="flex flex-wrap items-center justify-between gap-sm">
                <div className="flex flex-col">
                  <span className="text-body font-medium">{row.name}</span>
                  <span className="text-body-sm text-ink-muted">
                    SKU {row.code}
                  </span>
                </div>
                <dl className="flex flex-wrap gap-md text-body-sm">
                  <div>
                    <dt className="text-ink-muted">Em estoque</dt>
                    <dd>{row.onHand}</dd>
                  </div>
                  <div>
                    <dt className="text-ink-muted">Reservado</dt>
                    <dd>{row.reserved}</dd>
                  </div>
                  <div>
                    <dt className="text-ink-muted">Disponível</dt>
                    <dd>
                      {row.available > 0 ? (
                        row.available
                      ) : (
                        <Badge variant="outline">Sob encomenda</Badge>
                      )}
                    </dd>
                  </div>
                </dl>
                {canUpdate && editing !== row.skuId && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setNotice(undefined)
                      setEditing(row.skuId)
                    }}
                  >
                    Repor estoque
                  </Button>
                )}
              </div>
              {editing === row.skuId && (
                <RestockForm
                  row={row}
                  onCancel={() => setEditing(undefined)}
                  onDone={done}
                />
              )}
            </li>
          ))}
        </ul>
      )}

      <section className="flex flex-col gap-sm">
        <h2 className="text-headline-sm">Movimentações recentes</h2>
        {movements.length === 0 ? (
          <p className="text-body text-ink-muted">
            Nenhuma movimentação registrada.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-line-subtle">
            <table className="w-full min-w-[720px] text-left text-body-sm">
              <caption className="sr-only">
                Últimas movimentações de estoque
              </caption>
              <thead className="bg-subtle text-label">
                <tr>
                  <th scope="col" className="p-sm">
                    Data
                  </th>
                  <th scope="col" className="p-sm">
                    SKU
                  </th>
                  <th scope="col" className="p-sm">
                    Tipo
                  </th>
                  <th scope="col" className="p-sm">
                    Unidades
                  </th>
                  <th scope="col" className="p-sm">
                    Pedido
                  </th>
                  <th scope="col" className="p-sm">
                    Responsável
                  </th>
                  <th scope="col" className="p-sm">
                    Motivo
                  </th>
                </tr>
              </thead>
              <tbody>
                {movements.map((movement) => (
                  <tr key={movement.id} className="border-t border-line-subtle">
                    <td className="p-sm">
                      {dateTime.format(new Date(movement.createdAt))}
                    </td>
                    <td className="p-sm">{movement.code}</td>
                    <td className="p-sm">{movement.type}</td>
                    <td className="p-sm">{movement.quantity}</td>
                    <td className="p-sm">{movement.orderNumber ?? "—"}</td>
                    <td className="p-sm">{movement.user}</td>
                    <td className="p-sm">{movement.note ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
