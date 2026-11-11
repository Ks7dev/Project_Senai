import "server-only"
import { logger } from "@/features/shared/lib/logger/logger"
import {
  allVolumesFitCorreios,
  fromCents,
  toCents,
  type ShippingContext,
  type ShippingOption,
  type ShippingProvider,
} from "@/features/shared/lib/shipping/strategies"
import type { ShippingVolume } from "@/features/shared/lib/shipping/volumes"

/** Carrier aggregator settings, read from the environment. */
export type CarrierConfig = {
  /** API base URL; the aggregator sandbox by default. */
  baseUrl: string
  /** Bearer token of the sandbox application. */
  token: string
  /** User-Agent the aggregator requires, e.g. "App (contact)". */
  userAgent: string
  /** Timeout of the request, in milliseconds. */
  timeoutMs: number
}

/** Sandbox of the carrier aggregator (Melhor Envio). */
const DEFAULT_BASE_URL = "https://sandbox.melhorenvio.com.br"
const DEFAULT_USER_AGENT = "Atelier Bureau (sandbox)"
const DEFAULT_TIMEOUT_MS = 8000

/**
 * Carrier aggregator settings from the environment. Without the token
 * the integration is not configured and the order goes to the manual
 * quote (RN20).
 *
 * @returns The settings, or null when the token is missing.
 */
export function carrierConfig(): CarrierConfig | null {
  const token = process.env.CARRIER_API_TOKEN?.trim() ?? ""
  if (!token) return null
  const timeout = Number(process.env.CARRIER_API_TIMEOUT_MS)
  return {
    baseUrl: (process.env.CARRIER_API_BASE_URL || DEFAULT_BASE_URL).replace(
      /\/+$/,
      ""
    ),
    token,
    userAgent: process.env.CARRIER_API_USER_AGENT?.trim() || DEFAULT_USER_AGENT,
    timeoutMs:
      Number.isFinite(timeout) && timeout > 0 ? timeout : DEFAULT_TIMEOUT_MS,
  }
}

/** One service in the aggregator answer. */
type AggregatorService = {
  name?: unknown
  price?: unknown
  custom_price?: unknown
  delivery_time?: unknown
  custom_delivery_time?: unknown
  error?: unknown
  company?: { name?: unknown }
}

/**
 * Reads a price of the aggregator ("310.50" or 310.5).
 *
 * @param value - Price from the API.
 * @returns Integer cents, or null when unreadable or not positive.
 */
export function parseCarrierPrice(value: unknown): number | null {
  const text =
    typeof value === "number"
      ? String(value)
      : typeof value === "string"
        ? value.trim()
        : ""
  if (!/^\d+(\.\d+)?$/.test(text)) return null
  const cents = toCents(text)
  return cents > 0 ? cents : null
}

/**
 * Turns one aggregator service into an option for the customer, with
 * the carrier, the delivery time and the price (RF49). Services with
 * an error (no route, volume refused) or unreadable data are dropped.
 *
 * @param service - Service from the API.
 * @returns The option, or null.
 */
export function toCarrierOption(
  service: AggregatorService
): ShippingOption | null {
  if (service.error) return null
  const cents =
    parseCarrierPrice(service.custom_price) ?? parseCarrierPrice(service.price)
  const days = Number(service.custom_delivery_time ?? service.delivery_time)
  const carrier =
    typeof service.company?.name === "string" ? service.company.name.trim() : ""
  const name = typeof service.name === "string" ? service.name.trim() : ""
  if (cents === null || !Number.isInteger(days) || days <= 0) return null
  if (!carrier || !name) return null
  return {
    method: "CARRIER",
    carrier: carrier.slice(0, 120),
    service: name.slice(0, 120),
    price: fromCents(cents),
    deliveryDays: days,
  }
}

/**
 * Builds the products of the quote request: identical volumes are
 * grouped with a quantity, dimensions in cm and weight in kg.
 *
 * @param volumes - Order packages.
 * @returns The request products.
 */
export function toAggregatorProducts(volumes: ShippingVolume[]): Array<{
  id: string
  width: number
  height: number
  length: number
  weight: number
  insurance_value: number
  quantity: number
}> {
  const groups = new Map<string, { volume: ShippingVolume; quantity: number }>()
  for (const volume of volumes) {
    const key = [
      volume.weightKg,
      volume.lengthCm,
      volume.widthCm,
      volume.heightCm,
    ].join("|")
    const group = groups.get(key)
    if (group) group.quantity += 1
    else groups.set(key, { volume, quantity: 1 })
  }
  return [...groups.values()].map(({ volume, quantity }, index) => ({
    id: `volume-${index + 1}`,
    width: Math.ceil(volume.widthCm),
    height: Math.ceil(volume.heightCm),
    length: Math.ceil(volume.lengthCm),
    weight: volume.weightKg,
    insurance_value: 0,
    quantity,
  }))
}

/**
 * Quotes the carriers of the aggregator (#42, RF49, RN20) for orders
 * with a volume above the Correios limits. Never throws: a missing
 * token, a timeout or an API error returns no option, so the checkout
 * falls back to the manual quote of the sales team. Logs carry only
 * the HTTP status, never the CEPs, the token or the payload.
 *
 * @param context - Destination, volumes, rules and the origin CEP.
 * @param fetcher - Fetch implementation (replaced in tests).
 * @returns Carrier options with carrier, delivery time and price.
 */
export async function quoteCarrier(
  context: ShippingContext,
  fetcher: typeof fetch = fetch
): Promise<ShippingOption[]> {
  if (context.volumes.length === 0 || allVolumesFitCorreios(context)) {
    return []
  }
  const config = carrierConfig()
  if (!config) {
    logger.info("shipping provider not configured", { provider: "carrier" })
    return []
  }
  if (!context.originCep) {
    logger.warn("shipping origin cep not configured", { provider: "carrier" })
    return []
  }
  try {
    const response = await fetcher(
      `${config.baseUrl}/api/v2/me/shipment/calculate`,
      {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          Authorization: `Bearer ${config.token}`,
          "User-Agent": config.userAgent,
        },
        body: JSON.stringify({
          from: { postal_code: context.originCep },
          to: { postal_code: context.cep },
          products: toAggregatorProducts(context.volumes),
          options: { receipt: false, own_hand: false },
        }),
        signal: AbortSignal.timeout(config.timeoutMs),
        cache: "no-store",
      }
    )
    if (!response.ok) {
      logger.warn("carrier quote failed", { status: response.status })
      return []
    }
    const data: unknown = await response.json()
    if (!Array.isArray(data)) {
      logger.warn("carrier quote returned an unexpected payload")
      return []
    }
    return data
      .map((service) => toCarrierOption(service as AggregatorService))
      .filter((option): option is ShippingOption => option !== null)
  } catch (error) {
    logger.warn("carrier quote unavailable", {
      error: error instanceof Error ? error.name : "unknown",
    })
    return []
  }
}

/** The carrier aggregator provider used by the strategies (RN20). */
export const carrierProvider: ShippingProvider = (context) =>
  quoteCarrier(context)
