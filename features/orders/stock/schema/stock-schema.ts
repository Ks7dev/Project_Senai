import { z } from "zod"

/** Largest restock accepted at once, to catch typos. */
export const MAX_RESTOCK_QUANTITY = 100_000

/** Filters of the stock list (RF43). */
export const stockFiltersSchema = z.object({
  search: z.string().trim().max(120).optional().default(""),
  onlyUnavailable: z.boolean().optional().default(false),
})

/** Stock list filters before validation. */
export type StockFiltersInput = z.input<typeof stockFiltersSchema>

/**
 * Manual restock of a SKU by the back office (RF43): units received and
 * the reason, both recorded in the stock movements.
 */
export const restockSchema = z.object({
  skuId: z.uuid("SKU inválido."),
  quantity: z
    .string("Informe a quantidade.")
    .trim()
    .regex(/^\d{1,6}$/, "Informe um número inteiro de unidades.")
    .transform(Number)
    .refine(
      (value) => value >= 1 && value <= MAX_RESTOCK_QUANTITY,
      `A quantidade deve ficar entre 1 e ${MAX_RESTOCK_QUANTITY.toLocaleString("pt-BR")}.`
    ),
  note: z
    .string("Informe o motivo da reposição.")
    .trim()
    .min(3, "Informe o motivo da reposição (ex.: nota do fornecedor).")
    .max(255, "Use no máximo 255 caracteres."),
})

/** Restock form values. */
export type RestockInput = z.input<typeof restockSchema>

/** Restock values after validation. */
export type RestockData = z.output<typeof restockSchema>
