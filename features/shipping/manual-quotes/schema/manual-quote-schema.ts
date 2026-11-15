import { z } from "zod"

/** Shipping methods the sales team may quote (everything but manual). */
export const QUOTED_METHODS = {
  CORREIOS_PAC: "Correios PAC",
  CORREIOS_SEDEX: "Correios SEDEX",
  CARRIER: "Transportadora",
  OWN_DELIVERY: "Entrega própria com montagem",
} as const

/** A quoted shipping method key. */
export type QuotedMethod = keyof typeof QUOTED_METHODS

/**
 * Shipping quoted by hand by the sales team for an order in the queue
 * (#44, RN20): method, who delivers, price and delivery time.
 */
export const answerManualQuoteSchema = z.object({
  orderId: z.uuid("Pedido inválido."),
  method: z.enum(
    Object.keys(QUOTED_METHODS) as [QuotedMethod, ...QuotedMethod[]],
    "Escolha a modalidade."
  ),
  carrier: z
    .string()
    .trim()
    .min(2, "Informe quem faz a entrega.")
    .max(120, "Use no máximo 120 caracteres."),
  service: z
    .string()
    .trim()
    .min(2, "Informe o serviço.")
    .max(120, "Use no máximo 120 caracteres."),
  price: z
    .string("Informe o valor do frete.")
    .trim()
    .transform((value) => value.replace(",", "."))
    .pipe(z.string().regex(/^\d{1,10}(\.\d{1,2})?$/, "Valor inválido.")),
  deliveryDays: z
    .string()
    .trim()
    .regex(/^\d{0,3}$/, "Prazo inválido.")
    .transform((value) => (value === "" ? null : Number(value)))
    .refine(
      (value) => value === null || (value >= 1 && value <= 365),
      "O prazo deve ficar entre 1 e 365 dias úteis."
    ),
  note: z
    .string()
    .trim()
    .max(255, "Use no máximo 255 caracteres.")
    .optional()
    .default(""),
})

/** Answer form values. */
export type AnswerManualQuoteInput = z.input<typeof answerManualQuoteSchema>

/** Answer values after validation. */
export type AnswerManualQuoteData = z.output<typeof answerManualQuoteSchema>
