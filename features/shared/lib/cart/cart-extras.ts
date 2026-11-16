import {
  centsToMoney,
  moneyToCents,
} from "@/features/shared/lib/cart/cart-math"
import {
  lineServicesSchema,
  personalizationSchema,
  type EngravingRule,
  type Personalization,
  type ServiceRule,
} from "@/features/shared/schema/cart-schema"

/** Personalization and service rules read from the settings table. */
export type CartExtrasRules = {
  /** Laser engraving (RF51). */
  engraving: EngravingRule
  /** Additional services (RF52). */
  services: ServiceRule[]
}

/** What a product accepts, to decide which extras apply. */
export type ExtrasEligibility = {
  /** Product accepts laser engraving. */
  personalizable: boolean
  /** Product is furniture with installation (RN05). */
  requiresInstallation: boolean
}

/** A chosen service with its price for the line. */
export type PricedService = {
  /** Service key. */
  key: string
  /** Service name. */
  label: string
  /** Price per unit as a decimal string ("0.00" when courtesy). */
  unitPrice: string
  /** Price for the line quantity as a decimal string. */
  total: string
  /** Offered as a courtesy (no charge). */
  courtesy: boolean
  /** Business days added to the lead time. */
  extraBusinessDays: number
}

/** Extras of a cart line with their cost and lead time. */
export type LineExtras = {
  /** Valid engraving, or null. */
  personalization: Personalization | null
  /** Engraving cost for the line quantity as a decimal string. */
  engravingTotal: string
  /** Chosen services that apply to the product. */
  services: PricedService[]
  /** Engraving plus services as a decimal string. */
  extrasTotal: string
  /** Business days the extras add to the lead time of the line. */
  extraBusinessDays: number
}

/**
 * Whether an additional service applies to a product (RF52).
 *
 * @param rule - Service rule.
 * @param product - Product eligibility.
 * @returns True when the service can be chosen.
 */
export function isServiceEligible(
  rule: ServiceRule,
  product: ExtrasEligibility
): boolean {
  if (rule.eligibility === "installation") return product.requiresInstallation
  if (rule.eligibility === "personalizable") return product.personalizable
  return true
}

/**
 * Reads a stored engraving, ignoring malformed values.
 *
 * @param value - JSON stored in the cart item.
 * @returns The engraving, or null.
 */
export function parsePersonalization(value: unknown): Personalization | null {
  const parsed = personalizationSchema.safeParse(value)
  return parsed.success ? parsed.data : null
}

/**
 * Reads the stored service keys, ignoring malformed values.
 *
 * @param value - JSON stored in the cart item.
 * @returns Service keys.
 */
export function parseServiceKeys(value: unknown): string[] {
  const parsed = lineServicesSchema.safeParse(value)
  return parsed.success ? [...new Set(parsed.data)] : []
}

/**
 * Prices the engraving and the additional services of a line (RF51,
 * RF52). Every price is per unit. Engraving only counts for products
 * that accept it, services only when eligible and still offered; the
 * extra days add up within the line because they run one after the
 * other.
 *
 * @param line - Quantity, product eligibility and the stored extras.
 * @param rules - Rules from the settings table.
 * @returns The priced extras.
 */
export function priceLineExtras(
  line: ExtrasEligibility & {
    quantity: number
    personalization: unknown
    services: unknown
  },
  rules: CartExtrasRules
): LineExtras {
  const stored = line.personalizable
    ? parsePersonalization(line.personalization)
    : null
  const personalization =
    stored && stored.text.length <= rules.engraving.maxLength ? stored : null
  const engravingCents = personalization
    ? moneyToCents(rules.engraving.price) * line.quantity
    : 0

  const keys = parseServiceKeys(line.services)
  const services = rules.services
    .filter((rule) => keys.includes(rule.key) && isServiceEligible(rule, line))
    .map((rule) => {
      const unitCents = rule.courtesy ? 0 : moneyToCents(rule.price)
      return {
        key: rule.key,
        label: rule.label,
        unitPrice: centsToMoney(unitCents),
        total: centsToMoney(unitCents * line.quantity),
        courtesy: rule.courtesy,
        extraBusinessDays: rule.extraBusinessDays,
      }
    })
  const servicesCents = services.reduce(
    (sum, service) => sum + moneyToCents(service.total),
    0
  )

  return {
    personalization,
    engravingTotal: centsToMoney(engravingCents),
    services,
    extrasTotal: centsToMoney(engravingCents + servicesCents),
    extraBusinessDays:
      (personalization ? rules.engraving.extraBusinessDays : 0) +
      services.reduce((sum, service) => sum + service.extraBusinessDays, 0),
  }
}
