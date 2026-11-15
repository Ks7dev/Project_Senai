"use client"

import { useCallback, useRef, useState } from "react"
import { isValidCep } from "@/features/shared/schema/cep-schema"
import { lookupAddressByCep } from "@/features/shared/lib/viacep/cep-actions"
import type { CepAddress } from "@/features/shared/lib/viacep/viacep"
import { onlyDigits } from "@/features/shared/lib/validation/documents"

/** State of the CEP lookup shown next to the CEP field. */
export type CepLookupState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "found"; complete: boolean }
  | { status: "not_found" }
  | { status: "unavailable" }

/** Longest wait in the browser before freeing manual typing (RF38). */
const CLIENT_TIMEOUT_MS = 6000

/** Message for each lookup state, in Portuguese, or null when silent. */
export const CEP_LOOKUP_MESSAGES: Record<
  CepLookupState["status"],
  string | null
> = {
  idle: null,
  loading: "Buscando o endereço pelo CEP…",
  found: "Endereço preenchido pelo CEP. Confira e informe o número.",
  not_found: "CEP não encontrado. Preencha o endereço manualmente.",
  unavailable:
    "Não foi possível consultar o CEP agora. Preencha o endereço manualmente; isso não impede a compra.",
}

/**
 * Message for a lookup state, including the incomplete-address case
 * (CEPs that cover a whole city return no street, RF23).
 *
 * @param state - Current lookup state.
 * @returns The message, or null when nothing should be shown.
 */
export function cepLookupMessage(state: CepLookupState): string | null {
  if (state.status === "found" && !state.complete) {
    return "Encontramos a cidade pelo CEP. Complete a rua e o bairro."
  }
  return CEP_LOOKUP_MESSAGES[state.status]
}

/**
 * Address autofill by CEP for forms (RF22–RF24, RF38, RN21). Only calls
 * the server with 8 digits; a slow or failed lookup frees the manual
 * fields, which are never disabled. Responses for an older CEP are
 * ignored.
 *
 * @param onFound - Called with the address when ViaCEP finds it.
 * @returns The lookup state and the function to trigger it.
 */
export function useCepLookup(onFound: (address: CepAddress) => void) {
  const [state, setState] = useState<CepLookupState>({ status: "idle" })
  const lastCep = useRef<string | null>(null)

  const lookup = useCallback(
    async (value: string) => {
      const cep = onlyDigits(value)
      if (!isValidCep(cep)) {
        lastCep.current = null
        setState({ status: "idle" })
        return
      }
      if (cep === lastCep.current) return
      lastCep.current = cep
      setState({ status: "loading" })

      let timer: ReturnType<typeof setTimeout> | undefined
      const timeout = new Promise<null>((resolve) => {
        timer = setTimeout(() => resolve(null), CLIENT_TIMEOUT_MS)
      })
      const result = await Promise.race([
        lookupAddressByCep({ cep }).catch(() => null),
        timeout,
      ])
      clearTimeout(timer)
      if (lastCep.current !== cep) return

      if (!result || !result.success) {
        // Typing the same CEP again retries the lookup
        lastCep.current = null
        setState({ status: "unavailable" })
        return
      }
      const { lookup: found } = result
      if (found.status === "found") {
        onFound(found.address)
        setState({ status: "found", complete: found.complete })
      } else {
        setState({ status: found.status })
      }
    },
    [onFound]
  )

  return { state, lookup }
}
