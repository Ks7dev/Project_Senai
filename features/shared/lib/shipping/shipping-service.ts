import "server-only"
import type { Prisma } from "@/generated/prisma/client"
import { prisma } from "@/features/shared/lib/db/prisma"
import { AppError } from "@/features/shared/lib/errors/action-result"
import { logger } from "@/features/shared/lib/logger/logger"
import { carrierProvider } from "@/features/shared/lib/carrier/carrier"
import { correiosProvider } from "@/features/shared/lib/correios/correios"
import {
  getNumberSetting,
  getSetting,
} from "@/features/shared/lib/settings/settings"
import { loadManualQuoteResponseDays } from "@/features/shared/lib/shipping/manual-quote"
import {
  calculateShipping,
  createShippingStrategies,
  type CoverageRegion,
  type ShippingQuote,
  type ShippingStrategy,
} from "@/features/shared/lib/shipping/strategies"
import {
  toVolumes,
  type ShippingRules,
} from "@/features/shared/lib/shipping/volumes"
import { ownDeliveryRatesSchema } from "@/features/shared/schema/shipping-schema"

type Client = Pick<
  Prisma.TransactionClient,
  "setting" | "shippingRegion" | "sku"
>

/**
 * Reads the RN20 limits and the cubage factor from the settings table;
 * they are never fixed in the code.
 *
 * @param client - Prisma client or transaction.
 * @returns The shipping rules.
 */
export async function loadShippingRules(
  client: Client = prisma
): Promise<ShippingRules> {
  const [
    correiosMaxWeightKg,
    correiosMaxSideCm,
    correiosMaxDimensionsSumCm,
    cubageFactor,
  ] = await Promise.all([
    getNumberSetting("shipping.correios_max_weight_kg", client),
    getNumberSetting("shipping.correios_max_side_cm", client),
    getNumberSetting("shipping.correios_max_dimensions_sum_cm", client),
    getNumberSetting("shipping.cubage_factor", client),
  ])
  return {
    correiosMaxWeightKg,
    correiosMaxSideCm,
    correiosMaxDimensionsSumCm,
    cubageFactor,
  }
}

/**
 * Modalities with the real API clients (RN20): Correios (#41) and the
 * carrier aggregator (#42).
 */
const serverShippingStrategies = createShippingStrategies({
  correios: correiosProvider,
  carrier: carrierProvider,
})

/**
 * CEP the orders ship from, from the settings table (never fixed in
 * the code). An invalid value disables the API quotes, so the order
 * goes to the manual quote instead of a wrong price.
 *
 * @param client - Prisma client or transaction.
 * @returns The 8-digit CEP, or undefined when not configured.
 */
export async function loadOriginCep(
  client: Client = prisma
): Promise<string | undefined> {
  const value = await getSetting("shipping.origin_cep", client).catch(
    () => null
  )
  const cep = typeof value === "string" ? value.replace(/\D/g, "") : ""
  return cep.length === 8 ? cep : undefined
}

/**
 * Finds the active CEP range that contains the destination (RN16). CEPs
 * are fixed-length digit strings, so text comparison orders them.
 *
 * @param cep - Destination CEP, 8 digits.
 * @param client - Prisma client or transaction.
 * @returns The region, or null outside every range.
 */
export async function findCoverageRegion(
  cep: string,
  client: Client = prisma
): Promise<CoverageRegion | null> {
  const region = await client.shippingRegion.findFirst({
    where: { active: true, cepStart: { lte: cep }, cepEnd: { gte: cep } },
    orderBy: { cepStart: "desc" },
  })
  if (!region) return null
  const rates = ownDeliveryRatesSchema.safeParse(region.ownDeliveryRates ?? [])
  if (!rates.success) {
    logger.warn("invalid own delivery rates", { regionId: region.id })
  }
  return {
    id: region.id,
    name: region.name,
    ownDelivery: region.ownDelivery,
    ownDeliveryRates: rates.success ? rates.data : [],
  }
}

/**
 * Calculates the shipping of order lines to a CEP (RF25, RN20) with the
 * weight and dimensions stored on the products. Used by the shipping
 * estimate and by the checkout, which passes the cart lines.
 *
 * @param input - Destination CEP (8 digits) and lines by SKU code.
 * @param options - Prisma client and strategies (replaced in tests).
 * @returns The options, or the manual quote with the return time.
 * @throws AppError when a SKU is unknown or not for sale.
 */
export async function quoteShippingForItems(
  input: { cep: string; items: Array<{ skuCode: string; quantity: number }> },
  options: { client?: Client; strategies?: ShippingStrategy[] } = {}
): Promise<ShippingQuote> {
  const client = options.client ?? prisma
  const codes = [...new Set(input.items.map((item) => item.skuCode))]
  const skus = await client.sku.findMany({
    where: {
      code: { in: codes },
      active: true,
      product: { status: "ACTIVE", deletedAt: null },
    },
    select: {
      code: true,
      product: {
        select: {
          weightKg: true,
          lengthCm: true,
          widthCm: true,
          heightCm: true,
          requiresInstallation: true,
        },
      },
    },
  })
  const byCode = new Map(skus.map((sku) => [sku.code, sku.product]))
  if (codes.some((code) => !byCode.has(code))) {
    throw new AppError(
      "Um dos produtos não está disponível para calcular o frete.",
      "unknown_sku"
    )
  }

  const volumes = toVolumes(
    input.items.map((item) => {
      const product = byCode.get(item.skuCode)!
      return {
        quantity: item.quantity,
        weightKg: Number(product.weightKg),
        lengthCm: Number(product.lengthCm),
        widthCm: Number(product.widthCm),
        heightCm: Number(product.heightCm),
        requiresAssembly: product.requiresInstallation,
      }
    })
  )
  const [rules, region, originCep] = await Promise.all([
    loadShippingRules(client),
    findCoverageRegion(input.cep, client),
    loadOriginCep(client),
  ])
  const quote = await calculateShipping(
    { cep: input.cep, volumes, rules, region, originCep },
    options.strategies ?? serverShippingStrategies
  )
  if (quote.status === "quoted") return quote
  return {
    ...quote,
    responseBusinessDays: await loadManualQuoteResponseDays(client),
  }
}
