"use client"

import { useCallback, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { zodResolver } from "@hookform/resolvers/zod"
import { useForm } from "react-hook-form"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { FormField, fieldAria } from "@/components/ui/form-field"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  deleteAddress,
  saveAddress,
  setDefaultAddress,
  type SavedAddress,
} from "@/features/account/addresses/action/address-actions"
import {
  addressSchema,
  STATES,
  type AddressData,
  type AddressInput,
} from "@/features/account/addresses/schema/address-schema"
import {
  cepLookupMessage,
  useCepLookup,
} from "@/features/shared/lib/viacep/use-cep-lookup"
import type { CepAddress } from "@/features/shared/lib/viacep/viacep"

const empty: AddressInput = {
  label: "",
  recipient: "",
  cep: "",
  street: "",
  number: "",
  complement: "",
  district: "",
  city: "",
  state: "SP",
  isDefault: false,
}

/**
 * Delivery addresses of the account (#36, RF26): list with nickname and
 * default address, and the create/edit form. Read only for corporate
 * users who are not account administrators.
 *
 * @param props - Saved addresses and whether the user may edit.
 * @returns The addresses page content.
 */
export function AddressesView({
  addresses,
  canManage,
}: {
  addresses: SavedAddress[]
  canManage: boolean
}) {
  const router = useRouter()
  const [editing, setEditing] = useState<string | "new" | null>(
    addresses.length === 0 && canManage ? "new" : null
  )
  const [error, setError] = useState<string>()
  const [pending, startTransition] = useTransition()
  const form = useForm<AddressInput, unknown, AddressData>({
    resolver: zodResolver(addressSchema),
    defaultValues: empty,
  })
  const errors = form.formState.errors

  // ViaCEP fills the fields; they stay editable whatever happens (RF23)
  const fillFromCep = useCallback(
    (address: CepAddress) => {
      const options = { shouldValidate: true, shouldDirty: true }
      if (address.street) form.setValue("street", address.street, options)
      if (address.district) form.setValue("district", address.district, options)
      form.setValue("city", address.city, options)
      const state = STATES.find((uf) => uf === address.state)
      if (state) form.setValue("state", state, options)
    },
    [form]
  )
  const cepLookup = useCepLookup(fillFromCep)
  const cepMessage = cepLookupMessage(cepLookup.state)

  const run = (action: () => Promise<{ success: boolean; error?: string }>) =>
    startTransition(async () => {
      setError(undefined)
      const result = await action()
      if (!result.success) return setError(result.error)
      setEditing(null)
      router.refresh()
    })

  const startEdit = (address?: SavedAddress) => {
    form.reset(address ?? empty)
    setEditing(address?.id ?? "new")
  }

  const field = (
    name: keyof AddressInput,
    label: string,
    props: React.ComponentProps<typeof Input> = {}
  ) => (
    <FormField
      id={`address-${name}`}
      label={label}
      error={errors[name]?.message as string | undefined}
    >
      <Input
        id={`address-${name}`}
        {...props}
        {...fieldAria(`address-${name}`, errors[name]?.message as string)}
        {...form.register(name)}
      />
    </FormField>
  )

  return (
    <div className="flex flex-col gap-lg">
      {!canManage && (
        <p className="rounded bg-subtle p-sm text-body-sm text-ink-muted">
          Os endereços da empresa são editados pelo administrador da conta.
        </p>
      )}
      {addresses.length === 0 ? (
        <p className="text-body text-ink-muted">Nenhum endereço cadastrado.</p>
      ) : (
        <ul className="grid gap-md md:grid-cols-2">
          {addresses.map((address) => (
            <li
              key={address.id}
              className="flex flex-col gap-sm rounded-lg border border-line-subtle bg-elevated p-md"
            >
              <div className="flex items-center gap-sm">
                <h2 className="text-headline-sm">{address.label}</h2>
                {address.isDefault && <Badge>Padrão</Badge>}
              </div>
              <address className="text-body-sm text-ink not-italic">
                {address.recipient}
                <br />
                {address.street}, {address.number}
                {address.complement ? ` — ${address.complement}` : ""}
                <br />
                {address.district}, {address.city} — {address.state}
                <br />
                CEP {address.cep.replace(/^(\d{5})(\d{3})$/, "$1-$2")}
              </address>
              {canManage && (
                <div className="flex flex-wrap gap-sm">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => startEdit(address)}
                  >
                    Editar
                  </Button>
                  {!address.isDefault && (
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={pending}
                      onClick={() =>
                        run(() => setDefaultAddress({ id: address.id }))
                      }
                    >
                      Tornar padrão
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={pending}
                    onClick={() => run(() => deleteAddress({ id: address.id }))}
                  >
                    Remover
                  </Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {canManage && editing === null && (
        <Button className="self-start" onClick={() => startEdit()}>
          Adicionar endereço
        </Button>
      )}

      {canManage && editing !== null && (
        <form
          noValidate
          onSubmit={form.handleSubmit((values) =>
            run(() => saveAddress(values as AddressInput))
          )}
          className="flex flex-col gap-md rounded-lg border border-line-subtle bg-subtle p-lg"
        >
          <h2 className="text-headline-sm">
            {editing === "new" ? "Novo endereço" : "Editar endereço"}
          </h2>
          <div className="grid gap-md md:grid-cols-2">
            {field("label", "Apelido", {
              placeholder: "Matriz, Filial Centro, Obra…",
            })}
            {field("recipient", "Quem recebe")}
            <FormField id="address-cep" label="CEP" error={errors.cep?.message}>
              <Input
                id="address-cep"
                inputMode="numeric"
                autoComplete="postal-code"
                maxLength={9}
                aria-invalid={errors.cep ? true : undefined}
                aria-describedby={
                  errors.cep
                    ? "address-cep-error address-cep-status"
                    : "address-cep-status"
                }
                {...form.register("cep", {
                  onChange: (event) =>
                    void cepLookup.lookup(event.target.value),
                })}
              />
              <p
                id="address-cep-status"
                role="status"
                aria-live="polite"
                className="text-body-sm text-ink-muted"
              >
                {cepMessage}
              </p>
            </FormField>
            {field("street", "Rua", { autoComplete: "address-line1" })}
            {field("number", "Número")}
            {field("complement", "Complemento")}
            {field("district", "Bairro")}
            {field("city", "Cidade", { autoComplete: "address-level2" })}
            <FormField
              id="address-state"
              label="Estado"
              error={errors.state?.message}
            >
              <select
                id="address-state"
                className="h-11 rounded border border-line bg-canvas px-md text-body"
                {...form.register("state")}
              >
                {STATES.map((uf) => (
                  <option key={uf} value={uf}>
                    {uf}
                  </option>
                ))}
              </select>
            </FormField>
          </div>
          <Label className="flex items-center gap-sm">
            <Checkbox
              defaultChecked={form.getValues("isDefault")}
              onCheckedChange={(checked) =>
                form.setValue("isDefault", checked === true)
              }
            />
            Usar como endereço padrão
          </Label>
          <div className="flex gap-sm">
            <Button type="submit" disabled={pending}>
              Salvar endereço
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setEditing(null)}
            >
              Cancelar
            </Button>
          </div>
        </form>
      )}

      {error && (
        <p
          role="alert"
          className="rounded bg-error-tint p-sm text-body-sm text-error"
        >
          {error}
        </p>
      )}
    </div>
  )
}
