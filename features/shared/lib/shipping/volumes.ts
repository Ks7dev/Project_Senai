/** One package of the order, as sent to the carriers. */
export type ShippingVolume = {
  /** Real weight in kg. */
  weightKg: number
  /** Length in cm. */
  lengthCm: number
  /** Width in cm. */
  widthCm: number
  /** Height in cm. */
  heightCm: number
  /** Whether the item needs assembly or installation (RN05, RN16). */
  requiresAssembly: boolean
}

/** An order line with the product weight and dimensions per unit. */
export type ShippingItem = Omit<ShippingVolume, "requiresAssembly"> & {
  /** Units of the line; each unit ships as one volume. */
  quantity: number
  /** Whether the item needs assembly or installation. */
  requiresAssembly: boolean
}

/** Configurable shipping limits and factors (settings table, RN20). */
export type ShippingRules = {
  /** Maximum real weight per volume for the Correios, in kg. */
  correiosMaxWeightKg: number
  /** Maximum longest side per volume for the Correios, in cm. */
  correiosMaxSideCm: number
  /** Maximum sum of the three dimensions for the Correios, in cm. */
  correiosMaxDimensionsSumCm: number
  /** Cubage factor: cubed weight = L × W × H (cm) ÷ factor. */
  cubageFactor: number
}

/**
 * Splits order lines into volumes: each unit is shipped as its own
 * package with the product weight and dimensions.
 *
 * @param items - Order lines.
 * @returns One volume per unit.
 */
export function toVolumes(items: ShippingItem[]): ShippingVolume[] {
  return items.flatMap(({ quantity, ...volume }) =>
    Array.from({ length: quantity }, () => ({ ...volume }))
  )
}

/**
 * Cubed weight of a volume: length × width × height ÷ cubage factor.
 *
 * @param volume - Package dimensions.
 * @param cubageFactor - Configured factor (e.g. 6000).
 * @returns The cubed weight in kg.
 */
export function cubedWeightKg(
  volume: Pick<ShippingVolume, "lengthCm" | "widthCm" | "heightCm">,
  cubageFactor: number
): number {
  return (volume.lengthCm * volume.widthCm * volume.heightCm) / cubageFactor
}

/**
 * Billable weight of a volume: the larger of the real and the cubed
 * weight (#40).
 *
 * @param volume - Package.
 * @param cubageFactor - Configured factor.
 * @returns The billable weight in kg, rounded to grams.
 */
export function billableWeightKg(
  volume: ShippingVolume,
  cubageFactor: number
): number {
  return roundKg(Math.max(volume.weightKg, cubedWeightKg(volume, cubageFactor)))
}

/**
 * Billable weight of the order: the billable weight of each volume,
 * summed (#40).
 *
 * @param volumes - Order packages.
 * @param cubageFactor - Configured factor.
 * @returns The total billable weight in kg.
 */
export function totalBillableWeightKg(
  volumes: ShippingVolume[],
  cubageFactor: number
): number {
  return roundKg(
    volumes.reduce(
      (total, volume) => total + billableWeightKg(volume, cubageFactor),
      0
    )
  )
}

/**
 * Whether a volume is within the Correios limits of RN20: real weight
 * up to the maximum, longest side up to the maximum and sum of the
 * dimensions up to the maximum.
 *
 * @param volume - Package.
 * @param rules - Configured limits.
 * @returns True when PAC/SEDEX may carry it.
 */
export function fitsCorreios(
  volume: ShippingVolume,
  rules: ShippingRules
): boolean {
  const sides = [volume.lengthCm, volume.widthCm, volume.heightCm]
  return (
    volume.weightKg <= rules.correiosMaxWeightKg &&
    Math.max(...sides) <= rules.correiosMaxSideCm &&
    sides.reduce((sum, side) => sum + side, 0) <=
      rules.correiosMaxDimensionsSumCm
  )
}

/**
 * Rounds a weight to grams, avoiding floating point noise.
 *
 * @param kg - Weight in kg.
 * @returns The rounded weight.
 */
function roundKg(kg: number): number {
  return Math.round(kg * 1000) / 1000
}
