import { z } from "zod"

/** Shipping methods a quote may return (everything but the manual quote). */
const QUOTED_METHODS = [
  "CORREIOS_PAC",
  "CORREIOS_SEDEX",
  "CARRIER",
  "OWN_DELIVERY",
] as const

/** Payment methods offered at checkout (RF29). */
export const CHECKOUT_PAYMENT_METHODS = ["CARD", "PIX", "BOLETO"] as const

/** A payment method offered at checkout. */
export type CheckoutPaymentMethod = (typeof CHECKOUT_PAYMENT_METHODS)[number]

const moneySchema = (message: string) =>
  z.string(message).regex(/^\d{1,10}\.\d{2}$/, message)

/** Delivery address to quote the cart shipping for (RF25). */
export const checkoutQuoteSchema = z.object({
  addressId: z.uuid("Escolha o endereço de entrega."),
})

/** Values of the checkout shipping quote. */
export type CheckoutQuoteInput = z.input<typeof checkoutQuoteSchema>

/**
 * Order placed by the customer: address, chosen shipping option, payment
 * method and the amounts they saw, so the order only goes on when
 * nothing changed since the review. `option` is null when the address
 * needs the manual quote of the sales team (RN20).
 */
export const placeOrderSchema = checkoutQuoteSchema.extend({
  option: z
    .object({
      method: z.enum(QUOTED_METHODS, "Escolha uma opção de frete."),
      carrier: z.string().trim().min(1).max(120),
      service: z.string().trim().min(1).max(120),
    })
    .nullable(),
  expectedShippingPrice: moneySchema("Valor de frete inválido."),
  expectedTotal: moneySchema("Valor total inválido."),
  paymentMethod: z.enum(
    CHECKOUT_PAYMENT_METHODS,
    "Escolha a forma de pagamento."
  ),
})

/** Values of the order placement. */
export type PlaceOrderInput = z.input<typeof placeOrderSchema>
