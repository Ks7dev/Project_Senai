"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { zodResolver } from "@hookform/resolvers/zod"
import { PencilIcon, PlusIcon, Trash2Icon } from "lucide-react"
import { Controller, useForm } from "react-hook-form"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { FormField, fieldAria } from "@/components/ui/form-field"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  removeVolumeDiscount,
  saveVolumeDiscount,
  type VolumeDiscountRow,
} from "@/features/cart/price-tables/action/price-table-actions"
import {
  volumeDiscountFormSchema,
  type VolumeDiscountFormData,
  type VolumeDiscountFormInput,
} from "@/features/cart/price-tables/schema/price-table-schema"
import {
  describeVolumeMinimum,
  formatPercent,
  percentToBasisPoints,
} from "@/features/shared/lib/pricing/pricing-math"

type VolumeDiscountsPanelProps = {
  /** Categories for the rules. */
  categories: Array<{ id: string; name: string }>
  /** Rules not removed. */
  rules: VolumeDiscountRow[]
}

const emptyRule: VolumeDiscountFormInput = {
  categoryId: "",
  minQuantity: "",
  minAmount: "",
  discountPercent: "",
  active: true,
}

/**
 * Converts a saved rule into form values.
 *
 * @param rule - Rule from the server.
 * @returns The form values.
 */
function toForm(rule: VolumeDiscountRow): VolumeDiscountFormInput {
  return {
    id: rule.id,
    categoryId: rule.categoryId,
    minQuantity: rule.minQuantity,
    minAmount: rule.minAmount.replace(".", ","),
    discountPercent: rule.discountPercent.replace(".", ","),
    active: rule.active,
  }
}

/**
 * Automatic volume discounts by category (RN04): the minimum quantity
 * and/or amount of the category in the cart and the discount. When a
 * cart reaches more than one rule of a category, the largest applies.
 *
 * @param props - Categories and rules.
 * @returns The rules section.
 */
export function VolumeDiscountsPanel({
  categories,
  rules,
}: VolumeDiscountsPanelProps) {
  const router = useRouter()
  const [editing, setEditing] = useState<string | "new" | null>(null)
  const [message, setMessage] = useState<string>()
  const [error, setError] = useState<string>()
  const [pending, startTransition] = useTransition()
  const form = useForm<
    VolumeDiscountFormInput,
    unknown,
    VolumeDiscountFormData
  >({
    resolver: zodResolver(volumeDiscountFormSchema),
    defaultValues: emptyRule,
  })
  const errors = form.formState.errors

  const open = (rule?: VolumeDiscountRow) => {
    setError(undefined)
    setMessage(undefined)
    form.reset(rule ? toForm(rule) : emptyRule)
    setEditing(rule?.id ?? "new")
  }

  const onSubmit = form.handleSubmit(() =>
    startTransition(async () => {
      setError(undefined)
      setMessage(undefined)
      const result = await saveVolumeDiscount(form.getValues())
      if (!result.success) return setError(result.error)
      setEditing(null)
      setMessage("Desconto por volume salvo.")
      router.refresh()
    })
  )

  const remove = (rule: VolumeDiscountRow) => {
    const confirmed = window.confirm(
      `Remover o desconto por volume de ${rule.categoryName}?`
    )
    if (!confirmed) return
    startTransition(async () => {
      setError(undefined)
      setMessage(undefined)
      const result = await removeVolumeDiscount({ id: rule.id })
      if (!result.success) return setError(result.error)
      setMessage("Desconto por volume removido.")
      router.refresh()
    })
  }

  const text = (
    name: "minQuantity" | "minAmount" | "discountPercent",
    label: string,
    hint: string
  ) => {
    const fieldError = errors[name]?.message
    return (
      <FormField
        id={`volume-${name}`}
        label={label}
        hint={hint}
        error={fieldError}
      >
        <Input
          id={`volume-${name}`}
          inputMode={name === "minQuantity" ? "numeric" : "decimal"}
          {...fieldAria(`volume-${name}`, fieldError)}
          {...form.register(name)}
        />
      </FormField>
    )
  }

  return (
    <section aria-labelledby="volume" className="flex flex-col gap-lg">
      <div className="flex flex-wrap items-center justify-between gap-md">
        <div className="flex max-w-2xl flex-col gap-xs">
          <h2 id="volume" className="text-headline-md">
            Descontos por volume
          </h2>
          <p className="text-body text-ink-muted">
            Aplicados automaticamente no carrinho e no checkout quando a
            quantidade e/ou o valor dos produtos da categoria atingem o mínimo.
            O desconto incide sobre o valor dos produtos da categoria, depois da
            tabela do cliente; gravação e serviços não entram.
          </p>
        </div>
        <Button onClick={() => open()} disabled={pending}>
          <PlusIcon aria-hidden /> Novo desconto
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
            {editing === "new"
              ? "Novo desconto por volume"
              : "Editar desconto por volume"}
          </h3>
          <div className="grid gap-md md:grid-cols-2">
            <FormField
              id="volume-categoryId"
              label="Categoria"
              error={errors.categoryId?.message}
            >
              <select
                id="volume-categoryId"
                className="h-11 rounded border border-line bg-canvas px-md text-body"
                {...fieldAria("volume-categoryId", errors.categoryId?.message)}
                {...form.register("categoryId")}
              >
                <option value="">Escolha…</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
            </FormField>
            {text("discountPercent", "Desconto (%)", "Ex.: 5 ou 7,5.")}
            {text(
              "minQuantity",
              "Quantidade mínima",
              "Unidades da categoria no carrinho. Opcional se houver valor mínimo."
            )}
            {text(
              "minAmount",
              "Valor mínimo (R$)",
              "Valor dos produtos da categoria. Opcional se houver quantidade mínima."
            )}
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
                Desconto ativo
              </Label>
            )}
          />
          <div className="flex flex-wrap gap-sm">
            <Button type="submit" disabled={pending}>
              Salvar desconto
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

      {rules.length === 0 ? (
        <p className="text-body text-ink-muted">
          Nenhum desconto por volume cadastrado.
        </p>
      ) : (
        <ul className="flex flex-col gap-md">
          {rules.map((rule) => (
            <li
              key={rule.id}
              className="flex flex-col gap-sm rounded-lg border border-line-subtle p-md"
            >
              <div className="flex flex-wrap items-center gap-sm">
                <h3 className="flex-1 text-headline-sm">{rule.categoryName}</h3>
                <Badge>
                  {formatPercent(percentToBasisPoints(rule.discountPercent))}
                </Badge>
                {!rule.active && <Badge variant="outline">Inativo</Badge>}
              </div>
              <p className="text-body-sm text-ink-muted">
                Vale{" "}
                {describeVolumeMinimum({
                  minQuantity: rule.minQuantity
                    ? Number(rule.minQuantity)
                    : null,
                  minAmount: rule.minAmount || null,
                })}
              </p>
              <div className="flex flex-wrap gap-sm">
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={pending}
                  onClick={() => open(rule)}
                >
                  <PencilIcon aria-hidden /> Editar
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={pending}
                  onClick={() => remove(rule)}
                >
                  <Trash2Icon aria-hidden /> Remover
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
