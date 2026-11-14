"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { zodResolver } from "@hookform/resolvers/zod"
import { PencilIcon, PlusIcon, Trash2Icon } from "lucide-react"
import { Controller, useFieldArray, useForm } from "react-hook-form"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { FormField, fieldAria } from "@/components/ui/form-field"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  removePriceTable,
  savePriceTable,
  type PriceTableRow,
  type PricingAdminData,
} from "@/features/cart/price-tables/action/price-table-actions"
import { CustomerAssignments } from "@/features/cart/price-tables/customer-assignments"
import {
  priceTableFormSchema,
  type PriceTableFormData,
  type PriceTableFormInput,
} from "@/features/cart/price-tables/schema/price-table-schema"
import { VolumeDiscountsPanel } from "@/features/cart/price-tables/volume-discounts-panel"
import {
  formatPercent,
  percentToBasisPoints,
} from "@/features/shared/lib/pricing/pricing-math"

const emptyTable: PriceTableFormInput = {
  name: "",
  description: "",
  discountPercent: "0",
  active: true,
  items: [],
}

/**
 * Converts a saved table into form values.
 *
 * @param table - Table from the server.
 * @returns The form values.
 */
function toForm(table: PriceTableRow): PriceTableFormInput {
  return {
    id: table.id,
    name: table.name,
    description: table.description,
    discountPercent: table.discountPercent.replace(".", ","),
    active: table.active,
    items: table.items.map((item) => ({
      productId: item.productId,
      discountPercent: item.discountPercent.replace(".", ","),
    })),
  }
}

/**
 * Formats a percentage decimal string for the back office.
 *
 * @param percent - Decimal string, e.g. "8.50".
 * @returns The label, e.g. "8,5%".
 */
function percentLabel(percent: string): string {
  return formatPercent(percentToBasisPoints(percent))
}

/**
 * Back office of the commercial prices (#52): customer and segment
 * price tables with their discounts per product (RF21), the table of
 * each corporate account and PF customer, and the automatic volume
 * discounts by category (RN04).
 *
 * @param props - Tables, customers, products, categories and rules.
 * @returns The editor.
 */
export function PriceTablesView({ data }: { data: PricingAdminData }) {
  const router = useRouter()
  const [editing, setEditing] = useState<string | "new" | null>(null)
  const [message, setMessage] = useState<string>()
  const [error, setError] = useState<string>()
  const [pending, startTransition] = useTransition()
  const form = useForm<PriceTableFormInput, unknown, PriceTableFormData>({
    resolver: zodResolver(priceTableFormSchema),
    defaultValues: emptyTable,
  })
  const items = useFieldArray({ control: form.control, name: "items" })
  const errors = form.formState.errors

  const open = (table?: PriceTableRow) => {
    setError(undefined)
    setMessage(undefined)
    form.reset(table ? toForm(table) : emptyTable)
    setEditing(table?.id ?? "new")
  }

  const onSubmit = form.handleSubmit(() =>
    startTransition(async () => {
      setError(undefined)
      setMessage(undefined)
      const result = await savePriceTable(form.getValues())
      if (!result.success) return setError(result.error)
      setEditing(null)
      setMessage("Tabela de preços salva.")
      router.refresh()
    })
  )

  const remove = (table: PriceTableRow) => {
    const confirmed = window.confirm(
      `Remover a tabela "${table.name}"? Os clientes dela voltam ao preço de catálogo.`
    )
    if (!confirmed) return
    startTransition(async () => {
      setError(undefined)
      setMessage(undefined)
      const result = await removePriceTable({ id: table.id })
      if (!result.success) return setError(result.error)
      setMessage("Tabela de preços removida.")
      router.refresh()
    })
  }

  const productName = new Map(data.products.map((p) => [p.id, p.name]))

  return (
    <div className="flex flex-col gap-2xl">
      <section aria-labelledby="tabelas" className="flex flex-col gap-lg">
        <div className="flex flex-wrap items-center justify-between gap-md">
          <div className="flex max-w-2xl flex-col gap-xs">
            <h2 id="tabelas" className="text-headline-md">
              Tabelas de preço
            </h2>
            <p className="text-body text-ink-muted">
              Cada tabela dá um desconto sobre o preço de catálogo para todos os
              produtos e, se quiser, um desconto diferente por produto. O
              cliente logado vê o preço da sua tabela na vitrine, no produto, no
              carrinho e no checkout.
            </p>
          </div>
          <Button onClick={() => open()} disabled={pending}>
            <PlusIcon aria-hidden /> Nova tabela
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

        {editing && (
          <form
            onSubmit={onSubmit}
            noValidate
            className="flex flex-col gap-lg rounded-lg border border-line-subtle bg-elevated p-lg"
          >
            <h3 className="text-headline-sm">
              {editing === "new" ? "Nova tabela" : "Editar tabela"}
            </h3>
            <div className="grid gap-md md:grid-cols-3">
              <FormField
                id="table-name"
                label="Nome da tabela"
                error={errors.name?.message}
              >
                <Input
                  id="table-name"
                  {...fieldAria("table-name", errors.name?.message)}
                  {...form.register("name")}
                />
              </FormField>
              <FormField
                id="table-discount"
                label="Desconto padrão (%)"
                hint="Vale para todos os produtos sem desconto próprio."
                error={errors.discountPercent?.message}
              >
                <Input
                  id="table-discount"
                  inputMode="decimal"
                  {...fieldAria(
                    "table-discount",
                    errors.discountPercent?.message
                  )}
                  {...form.register("discountPercent")}
                />
              </FormField>
              <FormField
                id="table-description"
                label="Descrição"
                hint="Opcional. Ex.: clientes corporativos com contrato."
                error={errors.description?.message}
              >
                <Input
                  id="table-description"
                  {...fieldAria(
                    "table-description",
                    errors.description?.message
                  )}
                  {...form.register("description")}
                />
              </FormField>
            </div>
            <Controller
              control={form.control}
              name="active"
              render={({ field }) => (
                <Label className="flex items-center gap-sm">
                  <Checkbox
                    checked={Boolean(field.value)}
                    onCheckedChange={(checked) =>
                      field.onChange(checked === true)
                    }
                  />
                  Tabela ativa
                </Label>
              )}
            />

            <fieldset className="flex flex-col gap-md">
              <legend className="pb-sm text-headline-sm">
                Desconto por produto
              </legend>
              <p className="text-body-sm text-ink-muted">
                Substitui o desconto padrão da tabela no produto escolhido, em
                todas as variações.
              </p>
              {items.fields.map((item, index) => {
                const itemErrors = errors.items?.[index]
                return (
                  <div
                    key={item.id}
                    className="flex flex-wrap items-end gap-sm"
                  >
                    <FormField
                      id={`item-product-${index}`}
                      label="Produto"
                      error={itemErrors?.productId?.message}
                      className="min-w-56 flex-[2]"
                    >
                      <select
                        id={`item-product-${index}`}
                        className="h-11 rounded border border-line bg-canvas px-md text-body"
                        {...fieldAria(
                          `item-product-${index}`,
                          itemErrors?.productId?.message
                        )}
                        {...form.register(`items.${index}.productId`)}
                      >
                        <option value="">Escolha…</option>
                        {data.products.map((product) => (
                          <option key={product.id} value={product.id}>
                            {product.name}
                          </option>
                        ))}
                      </select>
                    </FormField>
                    <FormField
                      id={`item-discount-${index}`}
                      label="Desconto (%)"
                      error={itemErrors?.discountPercent?.message}
                      className="min-w-32 flex-1"
                    >
                      <Input
                        id={`item-discount-${index}`}
                        inputMode="decimal"
                        {...fieldAria(
                          `item-discount-${index}`,
                          itemErrors?.discountPercent?.message
                        )}
                        {...form.register(`items.${index}.discountPercent`)}
                      />
                    </FormField>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      aria-label={`Remover o desconto do produto ${index + 1}`}
                      onClick={() => items.remove(index)}
                    >
                      <Trash2Icon />
                    </Button>
                  </div>
                )
              })}
              {errors.items?.root?.message && (
                <p role="alert" className="text-body-sm text-error">
                  {errors.items.root.message}
                </p>
              )}
              {errors.items?.message && (
                <p role="alert" className="text-body-sm text-error">
                  {errors.items.message}
                </p>
              )}
              <Button
                type="button"
                variant="ghost"
                className="self-start"
                onClick={() =>
                  items.append({ productId: "", discountPercent: "" })
                }
              >
                <PlusIcon aria-hidden /> Adicionar produto
              </Button>
            </fieldset>

            <div className="flex flex-wrap gap-sm">
              <Button type="submit" disabled={pending}>
                Salvar tabela
              </Button>
              <Button
                type="button"
                variant="ghost"
                disabled={pending}
                onClick={() => setEditing(null)}
              >
                Cancelar
              </Button>
            </div>
          </form>
        )}

        {data.tables.length === 0 ? (
          <p className="text-body text-ink-muted">
            Nenhuma tabela cadastrada. Sem tabela, todos os clientes compram
            pelo preço de catálogo.
          </p>
        ) : (
          <ul className="flex flex-col gap-md">
            {data.tables.map((table) => (
              <li
                key={table.id}
                className="flex flex-col gap-sm rounded-lg border border-line-subtle p-md"
              >
                <div className="flex flex-wrap items-center gap-sm">
                  <h3 className="flex-1 text-headline-sm">{table.name}</h3>
                  <Badge>
                    {percentLabel(table.discountPercent)} sobre o catálogo
                  </Badge>
                  {!table.active && <Badge variant="outline">Inativa</Badge>}
                </div>
                {table.description && (
                  <p className="text-body-sm text-ink-muted">
                    {table.description}
                  </p>
                )}
                <p className="text-body-sm text-ink-muted">
                  {table.customerCount === 0
                    ? "Nenhum cliente usa esta tabela."
                    : `${table.customerCount} ${table.customerCount === 1 ? "cliente usa" : "clientes usam"} esta tabela.`}
                </p>
                {table.items.length > 0 && (
                  <ul className="flex flex-wrap gap-sm text-body-sm">
                    {table.items.map((item) => (
                      <li
                        key={item.productId}
                        className="rounded bg-subtle px-sm py-1"
                      >
                        {productName.get(item.productId) ?? item.productName}:{" "}
                        {percentLabel(item.discountPercent)}
                      </li>
                    ))}
                  </ul>
                )}
                <div className="flex flex-wrap gap-sm">
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={pending}
                    onClick={() => open(table)}
                  >
                    <PencilIcon aria-hidden /> Editar
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={pending}
                    onClick={() => remove(table)}
                  >
                    <Trash2Icon aria-hidden /> Remover
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <CustomerAssignments
        tables={data.tables}
        organizations={data.organizations}
        customers={data.customers}
      />

      <VolumeDiscountsPanel
        categories={data.categories}
        rules={data.volumeDiscounts}
      />
    </div>
  )
}
