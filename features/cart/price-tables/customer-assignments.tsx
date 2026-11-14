"use client"

import { useId, useState, useTransition, type FormEvent } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { FormField } from "@/components/ui/form-field"
import { Input } from "@/components/ui/input"
import {
  assignCustomerPriceTable,
  assignOrganizationPriceTable,
  type CustomerPricingRow,
  type OrganizationPricingRow,
  type PriceTableRow,
} from "@/features/cart/price-tables/action/price-table-actions"
import { formatCnpj } from "@/features/shared/lib/validation/documents"

type CustomerAssignmentsProps = {
  /** Price tables not removed. */
  tables: PriceTableRow[]
  /** Corporate accounts. */
  organizations: OrganizationPricingRow[]
  /** PF customers with a table. */
  customers: CustomerPricingRow[]
}

const selectClass = "h-11 rounded border border-line bg-canvas px-md text-body"

/**
 * Table of each customer (RF21): a select per corporate account (all
 * members buy with it) and the PF customers, found by e-mail.
 *
 * @param props - Tables, corporate accounts and PF customers.
 * @returns The assignments section.
 */
export function CustomerAssignments({
  tables,
  organizations,
  customers,
}: CustomerAssignmentsProps) {
  const id = useId()
  const router = useRouter()
  const [message, setMessage] = useState<string>()
  const [error, setError] = useState<string>()
  const [pending, startTransition] = useTransition()
  const [email, setEmail] = useState("")
  const [tableId, setTableId] = useState(tables[0]?.id ?? "")
  const tableName = new Map(tables.map((table) => [table.id, table.name]))

  const run = (
    action: () => Promise<
      { success: true } | { success: false; error: string }
    >,
    done: string
  ) =>
    startTransition(async () => {
      setError(undefined)
      setMessage(undefined)
      const result = await action()
      if (!result.success) return setError(result.error)
      setMessage(done)
      router.refresh()
    })

  const onAssignCustomer = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    run(
      () => assignCustomerPriceTable({ email, priceTableId: tableId }),
      tableId ? "Tabela atribuída ao cliente." : "Tabela removida do cliente."
    )
  }

  const options = (
    <>
      <option value="">Preço de catálogo (sem tabela)</option>
      {tables.map((table) => (
        <option key={table.id} value={table.id}>
          {table.name}
          {table.active ? "" : " (inativa)"}
        </option>
      ))}
    </>
  )

  return (
    <section aria-labelledby={`${id}-title`} className="flex flex-col gap-lg">
      <div className="flex max-w-2xl flex-col gap-xs">
        <h2 id={`${id}-title`} className="text-headline-md">
          Tabela de cada cliente
        </h2>
        <p className="text-body text-ink-muted">
          Os usuários de uma conta corporativa compram com a tabela da empresa.
          Clientes pessoa física recebem a tabela pelo e-mail de cadastro.
        </p>
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

      <div className="flex flex-col gap-sm">
        <h3 className="text-headline-sm">Contas corporativas</h3>
        {organizations.length === 0 ? (
          <p className="text-body-sm text-ink-muted">
            Nenhuma conta corporativa cadastrada.
          </p>
        ) : (
          <ul className="flex flex-col divide-y divide-line-subtle rounded-lg border border-line-subtle">
            {organizations.map((organization) => (
              <li
                key={organization.id}
                className="flex flex-wrap items-center gap-md p-md"
              >
                <div className="flex min-w-48 flex-1 flex-col text-body-sm">
                  <span className="text-ink">{organization.name}</span>
                  {organization.cnpj && (
                    <span className="text-ink-muted">
                      CNPJ {formatCnpj(organization.cnpj)}
                    </span>
                  )}
                </div>
                <label
                  htmlFor={`${id}-org-${organization.id}`}
                  className="sr-only"
                >
                  Tabela de preço de {organization.name}
                </label>
                <select
                  id={`${id}-org-${organization.id}`}
                  className={selectClass}
                  value={organization.priceTableId ?? ""}
                  disabled={pending}
                  onChange={(event) =>
                    run(
                      () =>
                        assignOrganizationPriceTable({
                          organizationId: organization.id,
                          priceTableId: event.target.value,
                        }),
                      `Tabela de ${organization.name} atualizada.`
                    )
                  }
                >
                  {options}
                </select>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex flex-col gap-sm">
        <h3 className="text-headline-sm">Clientes pessoa física</h3>
        <form
          onSubmit={onAssignCustomer}
          noValidate
          className="flex flex-wrap items-end gap-sm"
        >
          <FormField
            id={`${id}-email`}
            label="E-mail do cliente"
            className="min-w-56 flex-[2]"
          >
            <Input
              id={`${id}-email`}
              type="email"
              autoComplete="off"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </FormField>
          <FormField
            id={`${id}-table`}
            label="Tabela"
            className="min-w-48 flex-1"
          >
            <select
              id={`${id}-table`}
              className={selectClass}
              value={tableId}
              onChange={(event) => setTableId(event.target.value)}
            >
              {options}
            </select>
          </FormField>
          <Button type="submit" disabled={pending || !email.trim()}>
            Atribuir
          </Button>
        </form>
        {customers.length === 0 ? (
          <p className="text-body-sm text-ink-muted">
            Nenhum cliente pessoa física com tabela própria.
          </p>
        ) : (
          <ul className="flex flex-col divide-y divide-line-subtle rounded-lg border border-line-subtle">
            {customers.map((customer) => (
              <li
                key={customer.id}
                className="flex flex-wrap items-center gap-md p-md text-body-sm"
              >
                <div className="flex min-w-48 flex-1 flex-col">
                  <span className="text-ink">{customer.name}</span>
                  <span className="text-ink-muted">{customer.email}</span>
                </div>
                <span className="text-ink">
                  {tableName.get(customer.priceTableId) ?? "—"}
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={pending}
                  onClick={() =>
                    run(
                      () =>
                        assignCustomerPriceTable({
                          email: customer.email,
                          priceTableId: "",
                        }),
                      "Tabela removida do cliente."
                    )
                  }
                >
                  Remover tabela
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}
