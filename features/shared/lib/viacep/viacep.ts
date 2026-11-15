import "server-only"
import { logger } from "@/features/shared/lib/logger/logger"
import { onlyDigits } from "@/features/shared/lib/validation/documents"

/** Address fields filled from the CEP (RF22). */
export type CepAddress = {
  /** Street; empty for CEPs that cover a whole city. */
  street: string
  /** District; may be empty. */
  district: string
  /** City. */
  city: string
  /** State (UF). */
  state: string
}

/** Result of a CEP lookup. */
export type CepLookupResult =
  /** Address found; empty fields must be typed by the customer (RF23). */
  | { status: "found"; address: CepAddress; complete: boolean }
  /** ViaCEP does not know the CEP: the customer types the address. */
  | { status: "not_found" }
  /** Timeout or API down: manual typing, never a blocked checkout (RN21). */
  | { status: "unavailable" }

const DEFAULT_BASE_URL = "https://viacep.com.br/ws"
const DEFAULT_TIMEOUT_MS = 3000

/**
 * ViaCEP settings from the environment. ViaCEP is public and needs no
 * key; the URL and timeout are only overridable for tests and mirrors.
 *
 * @returns Base URL and timeout in milliseconds.
 */
export function viaCepConfig(): { baseUrl: string; timeoutMs: number } {
  const timeout = Number(process.env.VIACEP_TIMEOUT_MS)
  return {
    baseUrl: (process.env.VIACEP_BASE_URL || DEFAULT_BASE_URL).replace(
      /\/+$/,
      ""
    ),
    timeoutMs:
      Number.isFinite(timeout) && timeout > 0 ? timeout : DEFAULT_TIMEOUT_MS,
  }
}

/**
 * Looks up an address by CEP in ViaCEP (RF22). Has a timeout and never
 * throws: on any failure it returns "unavailable", so the caller frees
 * the manual address fields (RF23, RF38, RN21). The log has no CEP,
 * headers or payload.
 *
 * @param cep - CEP with or without punctuation; must have 8 digits.
 * @param fetcher - Fetch implementation (replaced in tests).
 * @returns The lookup result.
 */
export async function lookupCep(
  cep: string,
  fetcher: typeof fetch = fetch
): Promise<CepLookupResult> {
  const digits = onlyDigits(cep)
  if (digits.length !== 8) return { status: "not_found" }
  const { baseUrl, timeoutMs } = viaCepConfig()
  try {
    const response = await fetcher(`${baseUrl}/${digits}/json/`, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(timeoutMs),
      cache: "no-store",
    })
    if (response.status === 400 || response.status === 404) {
      return { status: "not_found" }
    }
    if (!response.ok) {
      logger.warn("viacep lookup failed", { status: response.status })
      return { status: "unavailable" }
    }
    const data = (await response.json()) as {
      erro?: boolean | string
      logradouro?: string
      bairro?: string
      localidade?: string
      uf?: string
    }
    if (data.erro === true || data.erro === "true") {
      return { status: "not_found" }
    }
    const address: CepAddress = {
      street: data.logradouro?.trim() ?? "",
      district: data.bairro?.trim() ?? "",
      city: data.localidade?.trim() ?? "",
      state: data.uf?.trim().toUpperCase() ?? "",
    }
    if (!address.city || !/^[A-Z]{2}$/.test(address.state)) {
      logger.warn("viacep returned an incomplete payload")
      return { status: "unavailable" }
    }
    return {
      status: "found",
      address,
      complete: Boolean(address.street && address.district),
    }
  } catch (error) {
    logger.warn("viacep lookup unavailable", {
      error: error instanceof Error ? error.name : "unknown",
    })
    return { status: "unavailable" }
  }
}
