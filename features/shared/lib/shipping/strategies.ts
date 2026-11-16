import { logger } from "@/features/shared/lib/logger/logger"
import {
  fitsCorreios,
  totalBillableWeightKg,
  type ShippingRules,
  type ShippingVolume,
} from "@/features/shared/lib/shipping/volumes"

/** Shipping methods stored on the shipment (Prisma `ShippingMethod`). */
export type ShippingMethodKey =
  | "CORREIOS_PAC"
  | "CORREIOS_SEDEX"
  | "CARRIER"
  | "OWN_DELIVERY"
  | "MANUAL_QUOTE"

/** Own delivery price for orders up to a billable weight (RF50). */
export type OwnDeliveryRate = {
  /** Maximum billable weight of the order covered by this price, in kg. */
  maxKg: number
  /** Price as a decimal string, e.g. "120.00". */
  price: string
}

/** CEP range that contains the destination (RN16, RF27). */
export type CoverageRegion = {
  /** Region id. */
  id: string
  /** Region name, in Portuguese. */
  name: string
  /** Whether the store delivers and assembles with its own team. */
  ownDelivery: boolean
  /** Own delivery prices by maximum weight, ascending. */
  ownDeliveryRates: OwnDeliveryRate[]
}

/** Everything a strategy needs to decide and to quote. */
export type ShippingContext = {
  /** Destination CEP, 8 digits. */
  cep: string
  /** One volume per unit of the order. */
  volumes: ShippingVolume[]
  /** Configured limits and cubage factor. */
  rules: ShippingRules
  /** Region of the destination CEP, or null outside every range. */
  region: CoverageRegion | null
  /** CEP the orders ship from (settings table); APIs need it. */
  originCep?: string
}

/** A price offered to the customer. */
export type ShippingOption = {
  /** Method stored on the shipment. */
  method: ShippingMethodKey
  /** Who delivers, e.g. "Correios" or the carrier name. */
  carrier: string
  /** Service name shown to the customer, e.g. "PAC". */
  service: string
  /** Price as a decimal string with 2 places. */
  price: string
  /** Business days to deliver; null when scheduled with the customer. */
  deliveryDays: number | null
  /** Price before free shipping, when a rule made it free (RN23). */
  originalPrice?: string
  /** Why the option became free: a promotion or the regional minimum. */
  freeShippingReason?: "promotion" | "regional_minimum"
}

/**
 * A shipping modality. The checkout only calls `calculateShipping`, so
 * a new modality is a new strategy in the registry, with no change to
 * the checkout (#40).
 */
export type ShippingStrategy = {
  /** Stable id, e.g. "correios". */
  id: string
  /** Whether RN20 sends this order to the modality. */
  appliesTo: (context: ShippingContext) => boolean
  /** Prices for the order; empty when the API fails or has no route. */
  quote: (context: ShippingContext) => Promise<ShippingOption[]>
}

/** Quotes prices from an external API (Correios, carrier aggregator). */
export type ShippingProvider = (
  context: ShippingContext
) => Promise<ShippingOption[]>

/** Why the order needs a manual quote from the sales team (RN20). */
export type ManualQuoteReason =
  /** Assembly required outside the own delivery area (RN16). */
  | "assembly_outside_coverage"
  /** No API answered or covered the route (RN20). */
  | "no_option"

/** Whether the destination is served by the own team (RF27). */
export type ShippingCoverage = {
  /** True inside the own delivery and assembly area (RN16). */
  ownDelivery: boolean
  /** Name of the region of the CEP, if any. */
  regionName: string | null
}

/** Result of the shipping calculation. */
export type ShippingQuote =
  | {
      status: "quoted"
      /** Strategy that produced the options. */
      strategy: string
      /** Options sorted by price. */
      options: ShippingOption[]
      /** Coverage of the destination. */
      coverage: ShippingCoverage
    }
  | {
      status: "manual_quote"
      /** Why the sales team must quote. */
      reason: ManualQuoteReason
      /** Return time promised to the customer, in business days (#44). */
      responseBusinessDays?: number
      /** Coverage of the destination. */
      coverage: ShippingCoverage
    }

/**
 * Whether any volume of the order needs assembly or installation.
 *
 * @param context - Shipping context.
 * @returns True when the order needs assembly.
 */
export function requiresAssembly(context: ShippingContext): boolean {
  return context.volumes.some((volume) => volume.requiresAssembly)
}

/**
 * Whether every volume fits the Correios limits (RN20).
 *
 * @param context - Shipping context.
 * @returns True when PAC/SEDEX may carry the whole order.
 */
export function allVolumesFitCorreios(context: ShippingContext): boolean {
  return context.volumes.every((volume) => fitsCorreios(volume, context.rules))
}

/**
 * Converts a decimal string into cents.
 *
 * @param value - Decimal string, e.g. "120.50".
 * @returns Integer cents.
 */
export function toCents(value: string | number): number {
  return Math.round(Number(value) * 100)
}

/**
 * Converts cents into a decimal string with 2 places.
 *
 * @param cents - Integer cents.
 * @returns Decimal string, e.g. "120.50".
 */
export function fromCents(cents: number): string {
  return (cents / 100).toFixed(2)
}

/**
 * Own delivery price for a billable weight: the first rate whose
 * maximum covers the weight (RF50).
 *
 * @param rates - Rates of the region.
 * @param weightKg - Billable weight of the order.
 * @returns The price, or null when the weight is above every rate.
 */
export function ownDeliveryPrice(
  rates: OwnDeliveryRate[],
  weightKg: number
): string | null {
  const rate = [...rates]
    .sort((a, b) => a.maxKg - b.maxKg)
    .find((item) => weightKg <= item.maxKg)
  return rate ? fromCents(toCents(rate.price)) : null
}

/**
 * Own delivery with assembly (RF50): applies when the order needs
 * assembly and the CEP is in the own delivery area (RN16, RN20). The
 * date is scheduled at checkout (RN05), so there is no delivery time.
 */
export const ownDeliveryStrategy: ShippingStrategy = {
  id: "own_delivery",
  /**
   * Assembly required and CEP inside the own delivery area.
   *
   * @param context - Shipping context.
   * @returns True when own delivery applies.
   */
  appliesTo: (context) =>
    requiresAssembly(context) && Boolean(context.region?.ownDelivery),
  /**
   * Price from the region table by the total billable weight.
   *
   * @param context - Shipping context.
   * @returns The own delivery option, or none above every rate.
   */
  quote: async (context) => {
    const weight = totalBillableWeightKg(
      context.volumes,
      context.rules.cubageFactor
    )
    const price = ownDeliveryPrice(
      context.region?.ownDeliveryRates ?? [],
      weight
    )
    if (price === null) return []
    return [
      {
        method: "OWN_DELIVERY",
        carrier: "Atelier Bureau",
        service: "Entrega própria com montagem",
        price,
        deliveryDays: null,
      },
    ]
  },
}

/**
 * Correios PAC/SEDEX (RN20): applies when no assembly is needed and
 * every volume fits the Correios limits.
 *
 * @param provider - Correios API client.
 * @returns The strategy.
 */
export function correiosStrategy(provider: ShippingProvider): ShippingStrategy {
  return {
    id: "correios",
    appliesTo: (context) =>
      !requiresAssembly(context) && allVolumesFitCorreios(context),
    quote: provider,
  }
}

/**
 * Carrier through the aggregator (RN20, RF49): applies when no assembly
 * is needed and some volume is above the Correios limits.
 *
 * @param provider - Carrier aggregator client.
 * @returns The strategy.
 */
export function carrierStrategy(provider: ShippingProvider): ShippingStrategy {
  return {
    id: "carrier",
    appliesTo: (context) =>
      !requiresAssembly(context) && !allVolumesFitCorreios(context),
    quote: provider,
  }
}

/**
 * Provider of an integration that is not wired yet: returns no option,
 * so the order goes to the manual quote (RN20).
 *
 * @param name - Integration name, for the log.
 * @returns A provider that never quotes.
 */
export function notConfiguredProvider(name: string): ShippingProvider {
  return async () => {
    logger.info("shipping provider not configured", { provider: name })
    return []
  }
}

/**
 * Builds the registered modalities, in RN20 precedence, with the API
 * clients of the Correios (#41) and of the carrier aggregator (#42).
 *
 * @param providers - Correios and carrier aggregator clients.
 * @returns The strategies.
 */
export function createShippingStrategies(providers: {
  correios: ShippingProvider
  carrier: ShippingProvider
}): ShippingStrategy[] {
  return [
    ownDeliveryStrategy,
    correiosStrategy(providers.correios),
    carrierStrategy(providers.carrier),
  ]
}

/**
 * Modalities without the API clients (they never quote). The server
 * wires the real clients in `shipping-service.ts`; this registry keeps
 * the pure calculation usable without credentials.
 */
export const shippingStrategies: ShippingStrategy[] = createShippingStrategies({
  correios: notConfiguredProvider("correios"),
  carrier: notConfiguredProvider("carrier"),
})

/**
 * Coverage of the destination for the checkout (RF27).
 *
 * @param region - Region of the CEP, or null.
 * @returns Whether the own team serves it and the region name.
 */
export function coverageOf(region: CoverageRegion | null): ShippingCoverage {
  return {
    ownDelivery: Boolean(region?.ownDelivery),
    regionName: region?.name ?? null,
  }
}

/**
 * Calculates the shipping of an order (RF25, RN20). Tries every
 * strategy that applies, in order; the first one with options wins.
 * When none applies or none answers, the order goes to the manual
 * quote of the sales team. A failing strategy never breaks the
 * checkout.
 *
 * @param context - Destination, volumes, rules and region.
 * @param strategies - Registered modalities (replaced in tests).
 * @returns Options sorted by price, or the manual quote.
 */
export async function calculateShipping(
  context: ShippingContext,
  strategies: ShippingStrategy[] = shippingStrategies
): Promise<ShippingQuote> {
  const coverage = coverageOf(context.region)
  const applicable = strategies.filter((strategy) =>
    strategy.appliesTo(context)
  )
  for (const strategy of applicable) {
    try {
      const options = await strategy.quote(context)
      if (options.length > 0) {
        return {
          status: "quoted",
          strategy: strategy.id,
          options: [...options].sort(
            (a, b) => toCents(a.price) - toCents(b.price)
          ),
          coverage,
        }
      }
    } catch (error) {
      logger.warn("shipping strategy failed", {
        strategy: strategy.id,
        error: error instanceof Error ? error.name : "unknown",
      })
    }
  }
  const reason: ManualQuoteReason =
    applicable.length === 0 && requiresAssembly(context)
      ? "assembly_outside_coverage"
      : "no_option"
  return { status: "manual_quote", reason, coverage }
}
