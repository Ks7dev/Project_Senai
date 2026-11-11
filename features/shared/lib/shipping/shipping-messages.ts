import type {
  ManualQuoteReason,
  ShippingCoverage,
  ShippingOption,
} from "@/features/shared/lib/shipping/strategies"

/**
 * Coverage notice shown with the shipping options (RF27): whether the
 * destination is served by the own delivery and assembly team (RN16)
 * or depends on the Correios or a carrier.
 *
 * @param coverage - Coverage of the destination CEP.
 * @returns The notice, in Portuguese.
 */
export function coverageMessage(coverage: ShippingCoverage): string {
  if (coverage.ownDelivery) {
    return `CEP dentro da área de entrega e montagem própria${
      coverage.regionName ? ` (${coverage.regionName})` : ""
    }.`
  }
  return "CEP fora da área de entrega e montagem própria: o envio é feito pelos Correios ou por transportadora."
}

/**
 * Why the shipping could not be calculated automatically (RN16, RN20).
 *
 * @param reason - Reason of the manual quote.
 * @returns The explanation, in Portuguese.
 */
export function manualQuoteReasonMessage(reason: ManualQuoteReason): string {
  return reason === "assembly_outside_coverage"
    ? "Este pedido tem itens com montagem e o CEP está fora da área de entrega própria, então o frete será cotado pela nossa equipe comercial."
    : "Não foi possível calcular o frete automaticamente para este CEP, então ele será cotado pela nossa equipe comercial."
}

/**
 * Return time of the manual shipping quote, shown to the customer when
 * the shipping cannot be calculated (RN20, #44).
 *
 * @param businessDays - Configured return time, in business days.
 * @returns The notice, in Portuguese.
 */
export function manualQuoteResponseMessage(businessDays: number): string {
  const days = businessDays === 1 ? "1 dia útil" : `${businessDays} dias úteis`
  return `Nossa equipe comercial retorna com o valor e o prazo do frete em até ${days}.`
}

/**
 * Delivery time of a shipping option.
 *
 * @param option - Shipping option.
 * @returns The time, in Portuguese.
 */
export function deliveryTimeMessage(option: ShippingOption): string {
  if (option.deliveryDays === null) return "Data agendada no checkout"
  return option.deliveryDays === 1
    ? "Até 1 dia útil"
    : `Até ${option.deliveryDays} dias úteis`
}
