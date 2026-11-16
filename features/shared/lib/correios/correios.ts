import "server-only"
import { logger } from "@/features/shared/lib/logger/logger"
import {
  allVolumesFitCorreios,
  fromCents,
  toCents,
  type ShippingContext,
  type ShippingMethodKey,
  type ShippingOption,
  type ShippingProvider,
} from "@/features/shared/lib/shipping/strategies"
import type { ShippingVolume } from "@/features/shared/lib/shipping/volumes"

/** Correios API settings, read from the environment (never versioned). */
export type CorreiosConfig = {
  /** API base URL; the homologation environment by default. */
  baseUrl: string
  /** User of the Correios "Meu Correios" account. */
  user: string
  /** Access code generated in the Correios developer portal. */
  accessCode: string
  /** Postage card number of the contract. */
  postageCard: string
  /** Contract number, sent for contract prices when set. */
  contract: string
  /** Regional board (DR) of the contract, sent with the contract. */
  regionalBoard: string
  /** Product code of PAC in the contract. */
  pacCode: string
  /** Product code of SEDEX in the contract. */
  sedexCode: string
  /** Timeout of each request, in milliseconds. */
  timeoutMs: number
}

/** Homologation (sandbox) environment of the Correios API. */
const DEFAULT_BASE_URL = "https://apihom.correios.com.br"
const DEFAULT_TIMEOUT_MS = 5000
/** Usual contract codes of PAC and SEDEX; overridable per contract. */
const DEFAULT_PAC_CODE = "03298"
const DEFAULT_SEDEX_CODE = "03220"
/** Object type "package" in the Correios price API. */
const PACKAGE_OBJECT_TYPE = "2"
/** Renews the token this long before it expires. */
const TOKEN_MARGIN_MS = 60_000

/**
 * Correios settings from the environment. Without the user, access
 * code or postage card the integration is not configured and the order
 * falls back to the next strategy or to the manual quote (RN20).
 *
 * @returns The settings, or null when the credentials are missing.
 */
export function correiosConfig(): CorreiosConfig | null {
  const user = process.env.CORREIOS_USER?.trim() ?? ""
  const accessCode = process.env.CORREIOS_ACCESS_CODE?.trim() ?? ""
  const postageCard = process.env.CORREIOS_POSTAGE_CARD?.trim() ?? ""
  if (!user || !accessCode || !postageCard) return null
  const timeout = Number(process.env.CORREIOS_TIMEOUT_MS)
  return {
    baseUrl: (process.env.CORREIOS_BASE_URL || DEFAULT_BASE_URL).replace(
      /\/+$/,
      ""
    ),
    user,
    accessCode,
    postageCard,
    contract: process.env.CORREIOS_CONTRACT?.trim() ?? "",
    regionalBoard: process.env.CORREIOS_REGIONAL_BOARD?.trim() ?? "",
    pacCode: process.env.CORREIOS_PAC_CODE?.trim() || DEFAULT_PAC_CODE,
    sedexCode: process.env.CORREIOS_SEDEX_CODE?.trim() || DEFAULT_SEDEX_CODE,
    timeoutMs:
      Number.isFinite(timeout) && timeout > 0 ? timeout : DEFAULT_TIMEOUT_MS,
  }
}

/** Error of a Correios request; carries only the HTTP status. */
class CorreiosError extends Error {
  /**
   * Creates the error of one step.
   *
   * @param step - Which call failed ("token", "price" or "deadline").
   * @param status - HTTP status, when there was a response.
   */
  constructor(
    public readonly step: string,
    public readonly status?: number
  ) {
    super(`correios ${step} failed`)
    this.name = "CorreiosError"
  }
}

let cachedToken: { value: string; expiresAt: number; key: string } | null = null

/**
 * Forgets the cached access token (tests and credential changes).
 */
export function resetCorreiosToken(): void {
  cachedToken = null
}

/**
 * Gets a bearer token for the postage card, reusing it until shortly
 * before it expires.
 *
 * @param config - Correios settings.
 * @param fetcher - Fetch implementation.
 * @returns The token.
 * @throws CorreiosError when the authentication fails.
 */
async function getToken(
  config: CorreiosConfig,
  fetcher: typeof fetch
): Promise<string> {
  const key = `${config.baseUrl}|${config.user}|${config.postageCard}`
  if (
    cachedToken &&
    cachedToken.key === key &&
    cachedToken.expiresAt - TOKEN_MARGIN_MS > Date.now()
  ) {
    return cachedToken.value
  }
  const basic = Buffer.from(`${config.user}:${config.accessCode}`).toString(
    "base64"
  )
  const response = await fetcher(
    `${config.baseUrl}/token/v1/autentica/cartaopostagem`,
    {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Authorization: `Basic ${basic}`,
      },
      body: JSON.stringify({ numero: config.postageCard }),
      signal: AbortSignal.timeout(config.timeoutMs),
      cache: "no-store",
    }
  )
  if (!response.ok) throw new CorreiosError("token", response.status)
  const data = (await response.json()) as { token?: string; expiraEm?: string }
  if (!data.token) throw new CorreiosError("token")
  const expiresAt = data.expiraEm ? Date.parse(data.expiraEm) : NaN
  cachedToken = {
    value: data.token,
    expiresAt: Number.isFinite(expiresAt)
      ? expiresAt
      : Date.now() + 30 * 60_000,
    key,
  }
  return data.token
}

/**
 * Parses a Correios price, sent as "1.234,56", "45,90" or a number.
 *
 * @param value - Price from the API.
 * @returns Integer cents, or null when unreadable.
 */
export function parseCorreiosPrice(value: unknown): number | null {
  if (typeof value === "number") {
    return Number.isFinite(value) && value > 0 ? toCents(value) : null
  }
  if (typeof value !== "string") return null
  const text = value.trim()
  const normalized = text.includes(",")
    ? text.replace(/\./g, "").replace(",", ".")
    : text
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return null
  const cents = toCents(normalized)
  return cents > 0 ? cents : null
}

/**
 * Groups identical volumes, so each package size is priced once.
 *
 * @param volumes - Order packages.
 * @returns Distinct volumes with how many of each.
 */
export function groupVolumes(
  volumes: ShippingVolume[]
): Array<{ volume: ShippingVolume; count: number }> {
  const groups = new Map<string, { volume: ShippingVolume; count: number }>()
  for (const volume of volumes) {
    const key = [
      volume.weightKg,
      volume.lengthCm,
      volume.widthCm,
      volume.heightCm,
    ].join("|")
    const group = groups.get(key)
    if (group) group.count += 1
    else groups.set(key, { volume, count: 1 })
  }
  return [...groups.values()]
}

/**
 * Calls a GET endpoint of the Correios API with the bearer token.
 *
 * @param url - Full URL.
 * @param step - Step name for errors.
 * @param token - Bearer token.
 * @param config - Correios settings.
 * @param fetcher - Fetch implementation.
 * @returns The JSON body.
 * @throws CorreiosError on a non-2xx answer.
 */
async function getJson(
  url: string,
  step: string,
  token: string,
  config: CorreiosConfig,
  fetcher: typeof fetch
): Promise<Record<string, unknown>> {
  const response = await fetcher(url, {
    headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(config.timeoutMs),
    cache: "no-store",
  })
  if (response.status === 401) resetCorreiosToken()
  if (!response.ok) throw new CorreiosError(step, response.status)
  return (await response.json()) as Record<string, unknown>
}

/** A Correios service quoted for the order. */
type CorreiosService = {
  method: Extract<ShippingMethodKey, "CORREIOS_PAC" | "CORREIOS_SEDEX">
  name: "PAC" | "SEDEX"
  code: string
}

/**
 * Quotes one Correios service for every volume of the order: the price
 * of each package size times how many there are, and the delivery
 * time of the route.
 *
 * @param service - PAC or SEDEX.
 * @param context - Shipping context with the origin CEP.
 * @param token - Bearer token.
 * @param config - Correios settings.
 * @param fetcher - Fetch implementation.
 * @returns The option.
 * @throws CorreiosError when any call fails or the answer is unreadable.
 */
async function quoteService(
  service: CorreiosService,
  context: ShippingContext & { originCep: string },
  token: string,
  config: CorreiosConfig,
  fetcher: typeof fetch
): Promise<ShippingOption> {
  const route = new URLSearchParams({
    cepOrigem: context.originCep,
    cepDestino: context.cep,
  })
  const contract = new URLSearchParams()
  if (config.contract) {
    contract.set("nuContrato", config.contract)
    if (config.regionalBoard) contract.set("nuDR", config.regionalBoard)
  }

  const prices = await Promise.all(
    groupVolumes(context.volumes).map(async ({ volume, count }) => {
      const params = new URLSearchParams(route)
      params.set(
        "psObjeto",
        String(Math.max(1, Math.round(volume.weightKg * 1000)))
      )
      params.set("tpObjeto", PACKAGE_OBJECT_TYPE)
      params.set("comprimento", String(Math.ceil(volume.lengthCm)))
      params.set("largura", String(Math.ceil(volume.widthCm)))
      params.set("altura", String(Math.ceil(volume.heightCm)))
      contract.forEach((value, key) => params.set(key, value))
      const data = await getJson(
        `${config.baseUrl}/preco/v1/nacional/${service.code}?${params}`,
        "price",
        token,
        config,
        fetcher
      )
      const cents = parseCorreiosPrice(data.pcFinal)
      if (cents === null) throw new CorreiosError("price")
      return cents * count
    })
  )
  const deadline = await getJson(
    `${config.baseUrl}/prazo/v1/nacional/${service.code}?${route}`,
    "deadline",
    token,
    config,
    fetcher
  )
  const days = Number(deadline.prazoEntrega)
  if (!Number.isInteger(days) || days <= 0) {
    throw new CorreiosError("deadline")
  }
  return {
    method: service.method,
    carrier: "Correios",
    service: service.name,
    price: fromCents(prices.reduce((sum, cents) => sum + cents, 0)),
    deliveryDays: days,
  }
}

/**
 * Quotes PAC and SEDEX in the Correios API (#41, RF25, RN20). Only
 * orders whose every volume fits the Correios limits are quoted; any
 * other order returns no option without calling the API. Never throws:
 * a missing credential, a timeout or an API error returns the services
 * that answered (possibly none), so the checkout falls back to the
 * next strategy or to the manual quote. Logs carry only the step and
 * the HTTP status, never the CEPs, headers or payload.
 *
 * @param context - Destination, volumes, rules and the origin CEP.
 * @param fetcher - Fetch implementation (replaced in tests).
 * @returns PAC and/or SEDEX options.
 */
export async function quoteCorreios(
  context: ShippingContext,
  fetcher: typeof fetch = fetch
): Promise<ShippingOption[]> {
  if (context.volumes.length === 0 || !allVolumesFitCorreios(context)) {
    return []
  }
  const config = correiosConfig()
  if (!config) {
    logger.info("shipping provider not configured", { provider: "correios" })
    return []
  }
  const originCep = context.originCep
  if (!originCep) {
    logger.warn("shipping origin cep not configured", { provider: "correios" })
    return []
  }

  let token: string
  try {
    token = await getToken(config, fetcher)
  } catch (error) {
    logFailure(error)
    return []
  }
  const services: CorreiosService[] = [
    { method: "CORREIOS_PAC", name: "PAC", code: config.pacCode },
    { method: "CORREIOS_SEDEX", name: "SEDEX", code: config.sedexCode },
  ]
  const results = await Promise.allSettled(
    services.map((service) =>
      quoteService(service, { ...context, originCep }, token, config, fetcher)
    )
  )
  const options: ShippingOption[] = []
  for (const result of results) {
    if (result.status === "fulfilled") options.push(result.value)
    else logFailure(result.reason)
  }
  return options
}

/**
 * Logs a failed Correios call without CEPs, headers or payload.
 *
 * @param error - The failure.
 */
function logFailure(error: unknown): void {
  logger.warn("correios quote failed", {
    step: error instanceof CorreiosError ? error.step : "request",
    status: error instanceof CorreiosError ? error.status : undefined,
    error: error instanceof Error ? error.name : "unknown",
  })
}

/** The Correios provider used by the shipping strategies (RN20). */
export const correiosProvider: ShippingProvider = (context) =>
  quoteCorreios(context)
