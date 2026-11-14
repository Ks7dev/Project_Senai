import { z } from "zod"

/** Largest discount of a price table or volume rule, in percent. */
export const MAX_DISCOUNT_PERCENT = 90

/** Most product overrides a price table may have. */
export const MAX_TABLE_ITEMS = 500

/**
 * Percentage typed in the back office ("8,5" or "8.50"), normalized to
 * a decimal string with a dot. Between 0 and the maximum discount.
 */
const percent = z
  .string()
  .trim()
  .transform((value) => value.replace(",", "."))
  .pipe(
    z
      .string()
      .regex(/^\d{1,2}(\.\d{1,2})?$/, "Percentual inválido.")
      .refine(
        (value) => Number(value) <= MAX_DISCOUNT_PERCENT,
        `O desconto máximo é de ${MAX_DISCOUNT_PERCENT}%.`
      )
  )

/** Amount typed in the back office ("2.000,00" is not accepted). */
const money = z
  .string()
  .trim()
  .transform((value) => value.replace(",", "."))
  .pipe(z.string().regex(/^\d{1,10}(\.\d{1,2})?$/, "Valor inválido."))

/** Id of a user or corporate account (Better Auth ids). */
const accountId = z.string().trim().min(1).max(36)

/** A product discount of a price table, replacing the table default. */
export const priceTableItemSchema = z.object({
  productId: z.uuid("Escolha o produto."),
  discountPercent: percent,
})

/**
 * Price table of a customer or segment (RF21): name, default discount
 * over the catalog price and optional discounts per product.
 */
export const priceTableFormSchema = z
  .object({
    id: z.uuid().optional(),
    name: z.string().trim().min(2, "Informe o nome da tabela.").max(120),
    description: z.string().trim().max(255).optional().or(z.literal("")),
    discountPercent: percent,
    active: z.boolean().default(true),
    items: z
      .array(priceTableItemSchema)
      .max(MAX_TABLE_ITEMS, `Use no máximo ${MAX_TABLE_ITEMS} produtos.`),
  })
  .refine(
    (table) =>
      new Set(table.items.map((item) => item.productId)).size ===
      table.items.length,
    { path: ["items"], message: "Há produtos repetidos na tabela." }
  )

/** Price table form values. */
export type PriceTableFormInput = z.input<typeof priceTableFormSchema>

/** Price table values after validation. */
export type PriceTableFormData = z.output<typeof priceTableFormSchema>

/** A row id (price table or volume rule). */
export const pricingIdSchema = z.object({ id: z.uuid() })

/** Row id values. */
export type PricingIdInput = z.input<typeof pricingIdSchema>

/**
 * Assigns a price table to a corporate account, or removes it with an
 * empty table id (RF21).
 */
export const assignOrganizationTableSchema = z.object({
  organizationId: accountId,
  priceTableId: z.uuid().or(z.literal("")),
})

/** Corporate assignment values. */
export type AssignOrganizationTableInput = z.input<
  typeof assignOrganizationTableSchema
>

/**
 * Assigns a price table to a PF customer found by e-mail, or removes
 * it with an empty table id (RF21).
 */
export const assignCustomerTableSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .pipe(z.email("Informe o e-mail do cliente.")),
  priceTableId: z.uuid().or(z.literal("")),
})

/** Customer assignment values. */
export type AssignCustomerTableInput = z.input<typeof assignCustomerTableSchema>

/**
 * Automatic volume discount of a category (RN04): the minimum quantity
 * and/or amount of the category in the cart and the discount.
 */
export const volumeDiscountFormSchema = z
  .object({
    id: z.uuid().optional(),
    categoryId: z.uuid("Escolha a categoria."),
    minQuantity: z
      .string()
      .trim()
      .regex(/^\d{0,4}$/, "Quantidade inválida.")
      .transform((value) => (value ? Number(value) : null))
      .refine(
        (value) => value === null || value >= 1,
        "A quantidade mínima deve ser ao menos 1."
      ),
    minAmount: z
      .literal("")
      .or(
        money.refine(
          (value) => Number(value) > 0,
          "O valor mínimo deve ser maior que zero."
        )
      )
      .optional(),
    discountPercent: percent.refine(
      (value) => Number(value) > 0,
      "Informe um desconto maior que zero."
    ),
    active: z.boolean().default(true),
  })
  .refine((rule) => rule.minQuantity !== null || Boolean(rule.minAmount), {
    path: ["minQuantity"],
    message: "Informe a quantidade mínima, o valor mínimo ou os dois.",
  })

/** Volume discount form values. */
export type VolumeDiscountFormInput = z.input<typeof volumeDiscountFormSchema>

/** Volume discount values after validation. */
export type VolumeDiscountFormData = z.output<typeof volumeDiscountFormSchema>
