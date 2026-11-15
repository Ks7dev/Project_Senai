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
  saveShippingRegion,
  toggleShippingRegion,
  type RegionRow,
} from "@/features/shipping/regions/action/region-actions"
import {
  regionFormSchema,
  type RegionFormData,
  type RegionFormInput,
} from "@/features/shipping/regions/schema/region-schema"
import { formatCep } from "@/features/shared/schema/cep-schema"

const brl = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
})

const emptyRegion: RegionFormInput = {
  name: "",
  cepStart: "",
  cepEnd: "",
  ownDelivery: true,
  rates: [{ maxKg: "", price: "" }],
  freeShippingMinimum: "",
  active: true,
}

/**
 * Converts a saved region into form values.
 *
 * @param region - Region from the server.
 * @returns The form values.
 */
function toForm(region: RegionRow): RegionFormInput {
  return {
    id: region.id,
    name: region.name,
    cepStart: formatCep(region.cepStart),
    cepEnd: formatCep(region.cepEnd),
    ownDelivery: region.ownDelivery,
    rates: region.rates.map((rate) => ({
      maxKg: rate.maxKg.replace(".", ","),
      price: rate.price.replace(".", ","),
    })),
    freeShippingMinimum: region.freeShippingMinimum.replace(".", ","),
    active: region.active,
  }
}

/**
 * Back office manager of the own delivery and assembly coverage (#43,
 * RF27, RF50, RN16): CEP ranges, the price table by weight of each
 * range and the regional free shipping minimum.
 *
 * @param props - Every region, active or not.
 * @returns The manager.
 */
export function RegionsView({ regions }: { regions: RegionRow[] }) {
  const router = useRouter()
  const [editing, setEditing] = useState<string | "new" | null>(null)
  const [message, setMessage] = useState<string>()
  const [error, setError] = useState<string>()
  const [pending, startTransition] = useTransition()
  const form = useForm<RegionFormInput, unknown, RegionFormData>({
    resolver: zodResolver(regionFormSchema),
    defaultValues: emptyRegion,
  })
  const rates = useFieldArray({ control: form.control, name: "rates" })
  const errors = form.formState.errors

  const open = (region?: RegionRow) => {
    setError(undefined)
    setMessage(undefined)
    form.reset(region ? toForm(region) : emptyRegion)
    setEditing(region?.id ?? "new")
  }

  const onSubmit = form.handleSubmit(() =>
    startTransition(async () => {
      setError(undefined)
      setMessage(undefined)
      const result = await saveShippingRegion(form.getValues())
      if (!result.success) return setError(result.error)
      setEditing(null)
      setMessage("Região salva.")
      router.refresh()
    })
  )

  const toggle = (region: RegionRow) =>
    startTransition(async () => {
      setError(undefined)
      setMessage(undefined)
      const result = await toggleShippingRegion({
        id: region.id,
        active: !region.active,
      })
      if (!result.success) return setError(result.error)
      setMessage(region.active ? "Região desativada." : "Região ativada.")
      router.refresh()
    })

  const field = (
    name: "name" | "cepStart" | "cepEnd" | "freeShippingMinimum",
    label: string,
    options: { hint?: string; inputMode?: "decimal" | "numeric" } = {}
  ) => {
    const fieldError = errors[name]?.message
    return (
      <FormField
        id={`region-${name}`}
        label={label}
        error={fieldError}
        hint={options.hint}
      >
        <Input
          id={`region-${name}`}
          inputMode={options.inputMode}
          {...fieldAria(`region-${name}`, fieldError)}
          {...form.register(name)}
        />
      </FormField>
    )
  }

  const flag = (name: "ownDelivery" | "active", label: string) => (
    <Controller
      control={form.control}
      name={name}
      render={({ field: control }) => (
        <Label className="flex items-center gap-sm">
          <Checkbox
            checked={Boolean(control.value)}
            onCheckedChange={(checked) => control.onChange(checked === true)}
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
          Cada faixa de CEP define se a Atelier Bureau entrega e monta com
          equipe própria e quanto cobra por peso. As faixas ativas não podem se
          sobrepor. Fora delas, os itens com montagem vão para a cotação manual
          do comercial.
        </p>
        <Button onClick={() => open()} disabled={pending}>
          <PlusIcon aria-hidden /> Nova região
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
            {editing === "new" ? "Nova região" : "Editar região"}
          </h2>
          <div className="grid gap-md md:grid-cols-3">
            {field("name", "Nome da região")}
            {field("cepStart", "CEP inicial", { inputMode: "numeric" })}
            {field("cepEnd", "CEP final", { inputMode: "numeric" })}
          </div>
          <div className="flex flex-col gap-sm">
            {flag("ownDelivery", "Entrega própria com montagem nesta faixa")}
            {flag("active", "Região ativa")}
          </div>

          <fieldset className="flex flex-col gap-md">
            <legend className="pb-sm text-headline-sm">
              Tabela de entrega própria por peso
            </legend>
            <p className="text-body-sm text-ink-muted">
              O pedido usa a primeira faixa cujo peso máximo cobre o peso
              tarifável (maior entre o peso real e o cubado). Acima da última
              faixa, o pedido vai para a cotação manual.
            </p>
            {rates.fields.map((rate, index) => {
              const rateErrors = errors.rates?.[index]
              return (
                <div key={rate.id} className="flex flex-wrap items-end gap-sm">
                  <FormField
                    id={`rate-max-${index}`}
                    label="Até (kg)"
                    error={rateErrors?.maxKg?.message}
                    className="min-w-32 flex-1"
                  >
                    <Input
                      id={`rate-max-${index}`}
                      inputMode="decimal"
                      {...fieldAria(
                        `rate-max-${index}`,
                        rateErrors?.maxKg?.message
                      )}
                      {...form.register(`rates.${index}.maxKg`)}
                    />
                  </FormField>
                  <FormField
                    id={`rate-price-${index}`}
                    label="Valor (R$)"
                    error={rateErrors?.price?.message}
                    className="min-w-32 flex-1"
                  >
                    <Input
                      id={`rate-price-${index}`}
                      inputMode="decimal"
                      {...fieldAria(
                        `rate-price-${index}`,
                        rateErrors?.price?.message
                      )}
                      {...form.register(`rates.${index}.price`)}
                    />
                  </FormField>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    aria-label={`Remover faixa de peso ${index + 1}`}
                    onClick={() => rates.remove(index)}
                  >
                    <Trash2Icon />
                  </Button>
                </div>
              )
            })}
            {errors.rates?.root?.message && (
              <p role="alert" className="text-body-sm text-error">
                {errors.rates.root.message}
              </p>
            )}
            {errors.rates?.message && (
              <p role="alert" className="text-body-sm text-error">
                {errors.rates.message}
              </p>
            )}
            <Button
              type="button"
              variant="ghost"
              className="self-start"
              onClick={() => rates.append({ maxKg: "", price: "" })}
            >
              <PlusIcon aria-hidden /> Adicionar faixa de peso
            </Button>
          </fieldset>

          <div className="grid gap-md md:grid-cols-3">
            {field("freeShippingMinimum", "Pedido mínimo para frete grátis", {
              inputMode: "decimal",
              hint: "Opcional. Em branco: sem frete grátis nesta região.",
            })}
          </div>

          <div className="flex flex-wrap gap-sm">
            <Button type="submit" disabled={pending}>
              Salvar região
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

      <section aria-labelledby="regioes" className="flex flex-col gap-md">
        <h2 id="regioes" className="text-headline-md">
          Regiões cadastradas
        </h2>
        {regions.length === 0 ? (
          <p className="text-body text-ink-muted">
            Nenhuma região cadastrada. Sem regiões, todo item com montagem vai
            para a cotação manual.
          </p>
        ) : (
          <ul className="flex flex-col gap-md">
            {regions.map((region) => (
              <li
                key={region.id}
                className="flex flex-col gap-sm rounded-lg border border-line-subtle p-md"
              >
                <div className="flex flex-wrap items-center gap-sm">
                  <h3 className="flex-1 text-headline-sm">{region.name}</h3>
                  {region.ownDelivery ? (
                    <Badge>Entrega e montagem própria</Badge>
                  ) : (
                    <Badge variant="secondary">
                      Correios ou transportadora
                    </Badge>
                  )}
                  {!region.active && <Badge variant="outline">Inativa</Badge>}
                </div>
                <p className="text-body-sm text-ink-muted">
                  CEP {formatCep(region.cepStart)} a {formatCep(region.cepEnd)}
                  {region.freeShippingMinimum
                    ? ` · Frete grátis a partir de ${brl.format(Number(region.freeShippingMinimum))}`
                    : ""}
                </p>
                {region.rates.length > 0 && (
                  <ul className="flex flex-wrap gap-sm text-body-sm">
                    {region.rates.map((rate) => (
                      <li
                        key={rate.maxKg}
                        className="rounded bg-subtle px-sm py-1"
                      >
                        até {rate.maxKg.replace(".", ",")} kg:{" "}
                        {brl.format(Number(rate.price))}
                      </li>
                    ))}
                  </ul>
                )}
                <div className="flex flex-wrap gap-sm">
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={pending}
                    onClick={() => open(region)}
                  >
                    <PencilIcon aria-hidden /> Editar
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={pending}
                    onClick={() => toggle(region)}
                  >
                    {region.active ? "Desativar" : "Ativar"}
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
