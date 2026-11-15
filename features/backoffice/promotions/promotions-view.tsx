"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { zodResolver } from "@hookform/resolvers/zod"
import { PencilIcon, PlusIcon, Trash2Icon } from "lucide-react"
import { Controller, useForm, useWatch } from "react-hook-form"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { FormField, fieldAria } from "@/components/ui/form-field"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  deletePromotion,
  savePromotion,
  togglePromotion,
  type PromotionRow,
  type PromotionState,
  type PromotionTarget,
} from "@/features/backoffice/promotions/action/promotion-actions"
import {
  promotionFormSchema,
  toSaoPauloLocal,
  type PromotionFormData,
  type PromotionFormInput,
} from "@/features/backoffice/promotions/schema/promotion-schema"

const brl = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
})

const dateTime = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "America/Sao_Paulo",
})

const selectClass =
  "h-11 rounded border border-line bg-canvas px-md text-body text-ink focus-visible:border-primary focus-visible:ring-3 focus-visible:ring-primary/12 focus-visible:outline-none"

const SCOPE_LABEL: Record<PromotionRow["scope"], string> = {
  PRODUCT: "Produto",
  CATEGORY: "Categoria",
  COUPON: "Cupom",
}

const STATE_LABEL: Record<PromotionState, string> = {
  running: "Vigente",
  scheduled: "Agendada",
  ended: "Encerrada",
  inactive: "Desativada",
}

const emptyPromotion: PromotionFormInput = {
  name: "",
  scope: "PRODUCT",
  productId: "",
  categoryId: "",
  couponCode: "",
  discountType: "PERCENT",
  discountValue: "",
  freeShipping: false,
  minOrderTotal: "",
  startsAt: "",
  endsAt: "",
  active: true,
}

/**
 * Converts a saved promotion into form values.
 *
 * @param row - Promotion from the server.
 * @returns The form values.
 */
function toForm(row: PromotionRow): PromotionFormInput {
  return {
    id: row.id,
    name: row.name,
    scope: row.scope,
    productId: row.productId,
    categoryId: row.categoryId,
    couponCode: row.couponCode,
    discountType: row.discountType,
    discountValue: row.discountValue.replace(".", ","),
    freeShipping: row.freeShipping,
    minOrderTotal: row.minOrderTotal.replace(".", ","),
    startsAt: toSaoPauloLocal(new Date(row.startsAt)),
    endsAt: toSaoPauloLocal(new Date(row.endsAt)),
    active: row.active,
  }
}

/**
 * Describes the discount of a promotion.
 *
 * @param row - Promotion.
 * @returns The text, in Portuguese.
 */
function discountLabel(row: PromotionRow): string {
  const parts: string[] = []
  if (Number(row.discountValue) > 0) {
    parts.push(
      row.discountType === "PERCENT"
        ? `${row.discountValue.replace(".", ",").replace(/,00$/, "")}% de desconto`
        : `${brl.format(Number(row.discountValue))} de desconto${row.scope === "COUPON" ? " no pedido" : " por unidade"}`
    )
  }
  if (row.freeShipping) parts.push("frete cortesia")
  if (row.minOrderTotal) {
    parts.push(`pedido mínimo de ${brl.format(Number(row.minOrderTotal))}`)
  }
  return parts.join(" · ")
}

type PromotionsViewProps = {
  /** Promotions not deleted. */
  promotions: PromotionRow[]
  /** Products that may receive a promotion. */
  products: PromotionTarget[]
  /** Categories that may receive a promotion. */
  categories: PromotionTarget[]
}

/**
 * Back office manager of promotions (#73, RF46, RN23): discounts by
 * product, category (subcategories included) or coupon, percent or
 * fixed, with validity, minimum order and courtesy shipping.
 *
 * @param props - Promotions, products and categories.
 * @returns The manager.
 */
export function PromotionsView({
  promotions,
  products,
  categories,
}: PromotionsViewProps) {
  const router = useRouter()
  const [editing, setEditing] = useState<string | "new" | null>(null)
  const [message, setMessage] = useState<string>()
  const [error, setError] = useState<string>()
  const [pending, startTransition] = useTransition()
  const form = useForm<PromotionFormInput, unknown, PromotionFormData>({
    resolver: zodResolver(promotionFormSchema),
    defaultValues: emptyPromotion,
  })
  const scope = useWatch({ control: form.control, name: "scope" })
  const discountType = useWatch({ control: form.control, name: "discountType" })
  const errors = form.formState.errors

  const open = (row?: PromotionRow) => {
    setError(undefined)
    setMessage(undefined)
    form.reset(row ? toForm(row) : emptyPromotion)
    setEditing(row?.id ?? "new")
  }

  const finish = (text: string) => {
    setMessage(text)
    router.refresh()
  }

  const onSubmit = form.handleSubmit(() =>
    startTransition(async () => {
      setError(undefined)
      setMessage(undefined)
      const result = await savePromotion(form.getValues())
      if (!result.success) return setError(result.error)
      setEditing(null)
      finish("Promoção salva.")
    })
  )

  const toggle = (row: PromotionRow) =>
    startTransition(async () => {
      setError(undefined)
      setMessage(undefined)
      const result = await togglePromotion({ id: row.id, active: !row.active })
      if (!result.success) return setError(result.error)
      finish(row.active ? "Promoção desativada." : "Promoção ativada.")
    })

  const remove = (row: PromotionRow) => {
    if (!window.confirm(`Excluir a promoção "${row.name}"?`)) return
    startTransition(async () => {
      setError(undefined)
      setMessage(undefined)
      const result = await deletePromotion({ id: row.id })
      if (!result.success) return setError(result.error)
      finish("Promoção excluída.")
    })
  }

  const text = (
    name: "name" | "couponCode" | "discountValue" | "minOrderTotal",
    label: string,
    options: { hint?: string; inputMode?: "decimal" } = {}
  ) => {
    const fieldError = errors[name]?.message
    return (
      <FormField
        id={`promotion-${name}`}
        label={label}
        error={fieldError}
        hint={options.hint}
      >
        <Input
          id={`promotion-${name}`}
          inputMode={options.inputMode}
          {...fieldAria(`promotion-${name}`, fieldError)}
          {...form.register(name)}
        />
      </FormField>
    )
  }

  const when = (name: "startsAt" | "endsAt", label: string) => {
    const fieldError = errors[name]?.message
    return (
      <FormField
        id={`promotion-${name}`}
        label={label}
        error={fieldError}
        hint="Horário de Brasília."
      >
        <Input
          id={`promotion-${name}`}
          type="datetime-local"
          {...fieldAria(`promotion-${name}`, fieldError)}
          {...form.register(name)}
        />
      </FormField>
    )
  }

  const select = (
    name: "scope" | "discountType" | "productId" | "categoryId",
    label: string,
    options: Array<{ value: string; label: string }>
  ) => {
    const fieldError = errors[name]?.message
    return (
      <FormField id={`promotion-${name}`} label={label} error={fieldError}>
        <select
          id={`promotion-${name}`}
          className={selectClass}
          {...fieldAria(`promotion-${name}`, fieldError)}
          {...form.register(name)}
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </FormField>
    )
  }

  const flag = (name: "freeShipping" | "active", label: string) => (
    <Controller
      control={form.control}
      name={name}
      render={({ field }) => (
        <Label className="flex items-center gap-sm">
          <Checkbox
            checked={Boolean(field.value)}
            onCheckedChange={(checked) => field.onChange(checked === true)}
          />
          {label}
        </Label>
      )}
    />
  )

  return (
    <div className="flex flex-col gap-xl">
      <div className="flex flex-wrap items-center justify-between gap-md">
        <p className="max-w-2xl text-body text-ink-muted">
          A promoção só vale dentro da vigência e enquanto estiver ativa. Em
          cada item vale o maior desconto de produto ou categoria; o cupom é
          aplicado sobre o valor que sobra. O frete cortesia só é concedido
          pelas promoções marcadas aqui ou pelo pedido mínimo de cada região,
          definido em Frete e cobertura.
        </p>
        <Button onClick={() => open()} disabled={pending}>
          <PlusIcon aria-hidden /> Nova promoção
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
          <h2 className="text-headline-md">
            {editing === "new" ? "Nova promoção" : "Editar promoção"}
          </h2>
          <div className="grid gap-md md:grid-cols-2">
            {text("name", "Nome da promoção")}
            {select("scope", "Aplicar em", [
              { value: "PRODUCT", label: "Um produto" },
              { value: "CATEGORY", label: "Uma categoria e subcategorias" },
              { value: "COUPON", label: "Cupom no pedido" },
            ])}
            {scope === "PRODUCT" &&
              select("productId", "Produto", [
                { value: "", label: "Escolha o produto" },
                ...products.map((p) => ({ value: p.id, label: p.name })),
              ])}
            {scope === "CATEGORY" &&
              select("categoryId", "Categoria", [
                { value: "", label: "Escolha a categoria" },
                ...categories.map((c) => ({ value: c.id, label: c.name })),
              ])}
            {scope === "COUPON" &&
              text("couponCode", "Código do cupom", {
                hint: "Letras, números, hífen ou _. Ex.: BEMVINDO10",
              })}
          </div>
          <div className="grid gap-md md:grid-cols-3">
            {select("discountType", "Tipo de desconto", [
              { value: "PERCENT", label: "Percentual" },
              { value: "FIXED", label: "Valor fixo (R$)" },
            ])}
            {text(
              "discountValue",
              discountType === "PERCENT" ? "Desconto (%)" : "Desconto (R$)",
              {
                inputMode: "decimal",
                hint:
                  discountType === "FIXED" && scope !== "COUPON"
                    ? "Por unidade do item."
                    : "Use 0 para só frete cortesia.",
              }
            )}
            {text("minOrderTotal", "Pedido mínimo (R$)", {
              inputMode: "decimal",
              hint: "Opcional. Itens e serviços, antes do desconto.",
            })}
          </div>
          <div className="grid gap-md md:grid-cols-2">
            {when("startsAt", "Início da vigência")}
            {when("endsAt", "Fim da vigência")}
          </div>
          <div className="flex flex-col gap-sm">
            {flag("freeShipping", "Conceder frete cortesia")}
            {flag("active", "Promoção ativa")}
          </div>
          <div className="flex flex-wrap gap-sm">
            <Button type="submit" disabled={pending}>
              Salvar promoção
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

      <section aria-labelledby="promocoes" className="flex flex-col gap-md">
        <h2 id="promocoes" className="text-headline-md">
          Promoções cadastradas
        </h2>
        {promotions.length === 0 ? (
          <p className="text-body text-ink-muted">
            Nenhuma promoção cadastrada.
          </p>
        ) : (
          <ul className="flex flex-col gap-md">
            {promotions.map((row) => (
              <li
                key={row.id}
                className="flex flex-col gap-sm rounded-lg border border-line-subtle p-md"
              >
                <div className="flex flex-wrap items-center gap-sm">
                  <h3 className="flex-1 text-headline-sm">{row.name}</h3>
                  <Badge variant="secondary">{SCOPE_LABEL[row.scope]}</Badge>
                  <Badge
                    variant={row.state === "running" ? "default" : "outline"}
                  >
                    {STATE_LABEL[row.state]}
                  </Badge>
                </div>
                <p className="text-body-sm text-ink">
                  {row.scope === "PRODUCT" && row.productName}
                  {row.scope === "CATEGORY" && row.categoryName}
                  {row.scope === "COUPON" && `Cupom ${row.couponCode}`} ·{" "}
                  {discountLabel(row)}
                </p>
                <p className="text-body-sm text-ink-muted">
                  De {dateTime.format(new Date(row.startsAt))} até{" "}
                  {dateTime.format(new Date(row.endsAt))}
                </p>
                <div className="flex flex-wrap gap-sm">
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={pending}
                    onClick={() => open(row)}
                  >
                    <PencilIcon aria-hidden /> Editar
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={pending}
                    onClick={() => toggle(row)}
                  >
                    {row.active ? "Desativar" : "Ativar"}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={pending}
                    onClick={() => remove(row)}
                  >
                    <Trash2Icon aria-hidden /> Excluir
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
