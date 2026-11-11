import "server-only"
import { logger } from "@/features/shared/lib/logger/logger"
import { onlyDigits } from "@/features/shared/lib/validation/documents"

/** Result of a CNPJ lookup (RF09). */
export type CnpjLookup =
  | { status: "active"; legalName: string; tradeName: string | null }
  | { status: "inactive"; legalName: string; situation: string }
  | { status: "not_found" }
  /** API down or slow: the sign-up continues without the check. */
  | { status: "unavailable" }

const BASE_URL = "https://brasilapi.com.br/api/cnpj/v1"
const TIMEOUT_MS = 5000

/**
 * Looks up a CNPJ in BrasilAPI (public Receita Federal data) to fill
 * the legal name and check the registration status (RF09). Has a
 * timeout and never throws: when the API fails the caller falls back
 * to the typed data. The log has no CNPJ or payload.
 *
 * @param cnpj - CNPJ with or without punctuation.
 * @param fetcher - Fetch implementation (replaced in tests).
 * @returns The lookup result.
 */
export async function lookupCnpj(
  cnpj: string,
  fetcher: typeof fetch = fetch
): Promise<CnpjLookup> {
  try {
    const response = await fetcher(`${BASE_URL}/${onlyDigits(cnpj)}`, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    })
    if (response.status === 404) return { status: "not_found" }
    if (!response.ok) {
      logger.warn("brasilapi cnpj lookup failed", { status: response.status })
      return { status: "unavailable" }
    }
    const data = (await response.json()) as {
      razao_social?: string
      nome_fantasia?: string | null
      descricao_situacao_cadastral?: string
    }
    const legalName = data.razao_social?.trim()
    if (!legalName) return { status: "unavailable" }
    const situation = (data.descricao_situacao_cadastral ?? "").trim()
    if (situation.toUpperCase() !== "ATIVA") {
      return {
        status: "inactive",
        legalName,
        situation: situation || "Inativa",
      }
    }
    return {
      status: "active",
      legalName,
      tradeName: data.nome_fantasia?.trim() || null,
    }
  } catch (error) {
    logger.warn("brasilapi cnpj lookup unavailable", {
      error: error instanceof Error ? error.name : "unknown",
    })
    return { status: "unavailable" }
  }
}
