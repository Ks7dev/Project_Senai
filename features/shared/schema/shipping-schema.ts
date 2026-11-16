import { z } from "zod"
import { cepSchema } from "@/features/shared/schema/cep-schema"

/** Shipping calculation for a destination and order lines (RF25). */
export const shippingQuoteSchema = z.object({
  cep: cepSchema,
  items: z
    .array(
      z.object({
        skuCode: z.string().trim().min(1, "Produto inválido.").max(64),
        quantity: z
          .number("Quantidade inválida.")
          .int("Quantidade inválida.")
          .min(1, "Quantidade inválida.")
          .max(999, "Quantidade inválida."),
      })
    )
    .min(1, "Inclua ao menos um produto.")
    .max(100, "Pedido com produtos demais para calcular o frete."),
})

/** Shipping calculation values. */
export type ShippingQuoteInput = z.input<typeof shippingQuoteSchema>

/** Own delivery price table of a region, stored as JSON (RF50). */
export const ownDeliveryRatesSchema = z.array(
  z.object({
    maxKg: z.coerce.number().positive().max(100_000),
    price: z
      .string()
      .trim()
      .regex(/^\d{1,10}(\.\d{1,2})?$/, "Valor inválido."),
  })
)
