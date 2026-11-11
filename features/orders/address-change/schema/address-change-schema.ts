import { z } from "zod"

/** Methods a re-quote may return (everything but the manual quote). */
const QUOTED_METHODS = [
  "CORREIOS_PAC",
  "CORREIOS_SEDEX",
  "CARRIER",
  "OWN_DELIVERY",
] as const

/** Order and new address to re-quote the shipping for (RN15, #45). */
export const addressChangeQuoteSchema = z.object({
  orderId: z.uuid("Pedido inválido."),
  addressId: z.uuid("Escolha o novo endereço de entrega."),
})

/** Values of the re-quote request. */
export type AddressChangeQuoteInput = z.input<typeof addressChangeQuoteSchema>

/**
 * Customer confirmation of the address change (RN15, #45): the chosen
 * option and the shipping price they saw, so the change only goes on
 * when the price did not move since the quote. `option` is null when
 * the new address needs the manual quote of the sales team.
 */
export const confirmAddressChangeSchema = addressChangeQuoteSchema.extend({
  option: z
    .object({
      method: z.enum(QUOTED_METHODS, "Escolha uma opção de frete."),
      carrier: z.string().trim().min(1).max(120),
      service: z.string().trim().min(1).max(120),
    })
    .nullable(),
  expectedShippingPrice: z
    .string("Confirme o valor do novo frete.")
    .regex(/^\d{1,10}\.\d{2}$/, "Valor de frete inválido."),
})

/** Values of the confirmation. */
export type ConfirmAddressChangeInput = z.input<
  typeof confirmAddressChangeSchema
>
