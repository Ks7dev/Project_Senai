"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { FormField } from "@/components/ui/form-field"
import { Input } from "@/components/ui/input"
import {
  assignOrganizationSeller,
  createSellerRule,
  deactivateSellerRule,
  updateSellerPhone,
  type SellerRouting,
} from "@/features/after-sales/seller-routing/action/seller-routing-actions"
import type { SellerRuleInput } from "@/features/after-sales/seller-routing/schema/seller-routing-schema"
import {
  BRAZILIAN_STATES,
  SELLER_SEGMENT_LABEL,
} from "@/features/shared/lib/sellers/seller-routing"
import type { ActionResult } from "@/features/shared/lib/errors/action-result"

/** Classes of the native selects, matching the design system inputs. */
const SELECT_CLASS = "h-11 rounded border border-line bg-canvas px-md text-body"

/**
 * Formats a phone stored as digits, e.g. "(11) 91234-5678".
 *
 * @param phone - Digits.
 * @returns The formatted phone.
 */
function formatPhone(phone: string): string {
  const match = /^(\d{2})(\d{4,5})(\d{4})$/.exec(phone)
  return match ? `(${match[1]}) ${match[2]}-${match[3]}` : phone
}

/**
 * Seller routing of the back office (RF18, RN11): WhatsApp number of
 * each seller, rules by region and segment, and the dedicated seller of
 * each corporate account. Customers never change their seller.
 *
 * @param props - Sellers, rules and accounts.
 * @returns The screen.
 */
export function SellerRoutingView({ routing }: { routing: SellerRouting }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string>()
  const [notice, setNotice] = useState<string>()
  const [rule, setRule] = useState<SellerRuleInput>({
    sellerId: "",
    personType: "",
    state: "",
  })
  const [phones, setPhones] = useState<Record<string, string>>({})

  const run = (task: () => Promise<ActionResult>, done: string) =>
    startTransition(async () => {
      setError(undefined)
      setNotice(undefined)
      const result = await task()
      if (!result.success) return setError(result.error)
      setNotice(done)
      router.refresh()
    })

  return (
    <div className="flex flex-col gap-xl">
      <div aria-live="polite">
        {error && (
          <p role="alert" className="text-body-sm text-error">
            {error}
          </p>
        )}
        {notice && <p className="text-body-sm text-ink">{notice}</p>}
      </div>

      <section aria-labelledby="vendedores" className="flex flex-col gap-md">
        <h2 id="vendedores" className="text-headline-md">
          WhatsApp dos vendedores
        </h2>
        {routing.sellers.length === 0 ? (
          <p className="text-body text-ink-muted">
            Nenhum usuário com o perfil Comercial. Cadastre em Usuários.
          </p>
        ) : (
          <ul className="flex flex-col gap-md">
            {routing.sellers.map((seller) => (
              <li
                key={seller.id}
                className="flex flex-wrap items-end gap-sm rounded-lg border border-line-subtle p-md"
              >
                <FormField
                  id={`phone-${seller.id}`}
                  label={`${seller.name}${seller.phone ? ` · atual: ${formatPhone(seller.phone)}` : " · sem WhatsApp"}`}
                  className="min-w-0 flex-1"
                >
                  <Input
                    id={`phone-${seller.id}`}
                    inputMode="tel"
                    placeholder="(11) 91234-5678"
                    value={phones[seller.id] ?? ""}
                    onChange={(event) =>
                      setPhones({ ...phones, [seller.id]: event.target.value })
                    }
                  />
                </FormField>
                <Button
                  type="button"
                  disabled={pending || !phones[seller.id]}
                  onClick={() =>
                    run(
                      () =>
                        updateSellerPhone({
                          sellerId: seller.id,
                          phone: phones[seller.id] ?? "",
                        }),
                      "WhatsApp atualizado."
                    )
                  }
                >
                  Salvar WhatsApp
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="regras" className="flex flex-col gap-md">
        <h2 id="regras" className="text-headline-md">
          Regras por região e segmento
        </h2>
        <p className="text-body-sm text-ink-muted">
          Vale a regra mais específica para o estado do endereço e o segmento do
          cliente: estado e segmento, depois só o estado, depois só o segmento
          e, por fim, a regra geral. Contas corporativas com vendedor próprio
          ficam com ele.
        </p>
        {routing.rules.length === 0 ? (
          <p className="text-body text-ink-muted">Nenhuma regra ativa.</p>
        ) : (
          <ul className="flex flex-col gap-sm">
            {routing.rules.map((item) => (
              <li
                key={item.id}
                className="flex flex-wrap items-center gap-sm text-body"
              >
                <span className="min-w-0 flex-1">
                  {item.state ?? "Todos os estados"} ·{" "}
                  {item.personType
                    ? SELLER_SEGMENT_LABEL[item.personType]
                    : "Todos os segmentos"}{" "}
                  → <strong>{item.sellerName}</strong>
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={pending}
                  onClick={() =>
                    run(
                      () => deactivateSellerRule({ ruleId: item.id }),
                      "Regra desativada."
                    )
                  }
                >
                  Desativar
                </Button>
              </li>
            ))}
          </ul>
        )}
        <form
          className="grid gap-sm md:grid-cols-[1fr_12rem_10rem_auto] md:items-end"
          onSubmit={(event) => {
            event.preventDefault()
            run(() => createSellerRule(rule), "Regra criada.")
          }}
        >
          <FormField id="rule-seller" label="Vendedor">
            <select
              id="rule-seller"
              className={SELECT_CLASS}
              value={rule.sellerId}
              onChange={(event) =>
                setRule({ ...rule, sellerId: event.target.value })
              }
            >
              <option value="">Escolha</option>
              {routing.sellers.map((seller) => (
                <option key={seller.id} value={seller.id}>
                  {seller.name}
                </option>
              ))}
            </select>
          </FormField>
          <FormField id="rule-segment" label="Segmento">
            <select
              id="rule-segment"
              className={SELECT_CLASS}
              value={rule.personType}
              onChange={(event) =>
                setRule({
                  ...rule,
                  personType: event.target
                    .value as SellerRuleInput["personType"],
                })
              }
            >
              <option value="">Todos</option>
              <option value="PF">{SELLER_SEGMENT_LABEL.PF}</option>
              <option value="PJ">{SELLER_SEGMENT_LABEL.PJ}</option>
            </select>
          </FormField>
          <FormField id="rule-state" label="Estado">
            <select
              id="rule-state"
              className={SELECT_CLASS}
              value={rule.state}
              onChange={(event) =>
                setRule({
                  ...rule,
                  state: event.target.value as SellerRuleInput["state"],
                })
              }
            >
              <option value="">Todos</option>
              {BRAZILIAN_STATES.map((state) => (
                <option key={state} value={state}>
                  {state}
                </option>
              ))}
            </select>
          </FormField>
          <Button type="submit" disabled={pending || !rule.sellerId}>
            Adicionar regra
          </Button>
        </form>
      </section>

      <section aria-labelledby="contas" className="flex flex-col gap-md">
        <h2 id="contas" className="text-headline-md">
          Vendedor das contas corporativas
        </h2>
        {routing.accounts.length === 0 ? (
          <p className="text-body text-ink-muted">Nenhuma conta corporativa.</p>
        ) : (
          <ul className="flex flex-col gap-sm">
            {routing.accounts.map((account) => (
              <li
                key={account.id}
                className="flex flex-wrap items-center gap-sm"
              >
                <label
                  htmlFor={`account-${account.id}`}
                  className="min-w-0 flex-1 text-body"
                >
                  {account.name}
                </label>
                <select
                  id={`account-${account.id}`}
                  className={SELECT_CLASS}
                  defaultValue={account.sellerId ?? ""}
                  disabled={pending}
                  onChange={(event) => {
                    const sellerId = event.target.value
                    run(
                      () =>
                        assignOrganizationSeller({
                          organizationId: account.id,
                          sellerId,
                        }),
                      `Vendedor de ${account.name} atualizado.`
                    )
                  }}
                >
                  <option value="">Pelas regras</option>
                  {routing.sellers.map((seller) => (
                    <option key={seller.id} value={seller.id}>
                      {seller.name}
                    </option>
                  ))}
                </select>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
