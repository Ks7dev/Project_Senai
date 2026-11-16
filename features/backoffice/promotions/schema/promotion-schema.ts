import { z } from "zod"

/** São Paulo has no daylight saving time since 2019: always UTC−3. */
const SAO_PAULO_OFFSET = "-03:00"

const money = z
  .string()
  .trim()
  .transform((value) => value.replace(",", "."))
  .pipe(z.string().regex(/^\d{1,10}(\.\d{1,2})?$/, "Valor inválido."))

const localDateTime = (message: string) =>
  z
    .string(message)
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, message)
    .transform((value) => saoPauloLocalToDate(value))
    .refine((value) => !Number.isNaN(value.getTime()), message)

/**
 * Converts a local date and time typed in the back office (São Paulo)
 * into a UTC instant.
 *
 * @param value - "AAAA-MM-DDTHH:mm".
 * @returns The instant.
 */
export function saoPauloLocalToDate(value: string): Date {
  return new Date(`${value}:00.000${SAO_PAULO_OFFSET}`)
}

/**
 * Converts a UTC instant into the local date and time of São Paulo, as
 * the `datetime-local` input expects.
 *
 * @param date - Instant.
 * @returns "AAAA-MM-DDTHH:mm".
 */
export function toSaoPauloLocal(date: Date): string {
  const shifted = new Date(date.getTime() - 3 * 60 * 60 * 1000)
  return shifted.toISOString().slice(0, 16)
}

/**
 * Promotion form (RF46, RN23): discount by product, category or coupon,
 * percent or fixed, optional courtesy shipping and minimum order, with
 * the validity in São Paulo time.
 */
export const promotionFormSchema = z
  .object({
    id: z.uuid().optional(),
    name: z
      .string()
      .trim()
      .min(2, "Informe o nome da promoção.")
      .max(120, "Use até 120 caracteres."),
    scope: z.enum(["PRODUCT", "CATEGORY", "COUPON"], "Escolha a aplicação."),
    productId: z.uuid("Escolha o produto.").optional().or(z.literal("")),
    categoryId: z.uuid("Escolha a categoria.").optional().or(z.literal("")),
    couponCode: z
      .string()
      .trim()
      .transform((value) => value.replace(/\s+/g, "").toUpperCase())
      .pipe(
        z
          .string()
          .max(40, "Use até 40 caracteres.")
          .regex(/^[A-Z0-9_-]*$/, "Use apenas letras, números, hífen ou _.")
      )
      .optional(),
    discountType: z.enum(["PERCENT", "FIXED"], "Escolha o tipo de desconto."),
    discountValue: money,
    freeShipping: z.boolean().default(false),
    minOrderTotal: money.optional().or(z.literal("")),
    startsAt: localDateTime("Informe o início da vigência."),
    endsAt: localDateTime("Informe o fim da vigência."),
    active: z.boolean().default(true),
  })
  .refine((data) => data.endsAt.getTime() > data.startsAt.getTime(), {
    path: ["endsAt"],
    message: "O fim da vigência deve ser depois do início.",
  })
  .refine((data) => data.scope !== "PRODUCT" || Boolean(data.productId), {
    path: ["productId"],
    message: "Escolha o produto.",
  })
  .refine((data) => data.scope !== "CATEGORY" || Boolean(data.categoryId), {
    path: ["categoryId"],
    message: "Escolha a categoria.",
  })
  .refine(
    (data) => data.scope !== "COUPON" || (data.couponCode ?? "").length >= 3,
    {
      path: ["couponCode"],
      message: "Informe um código com ao menos 3 caracteres.",
    }
  )
  .refine(
    (data) =>
      data.discountType !== "PERCENT" || Number(data.discountValue) <= 100,
    { path: ["discountValue"], message: "O percentual vai até 100." }
  )
  .refine((data) => Number(data.discountValue) > 0 || data.freeShipping, {
    path: ["discountValue"],
    message: "Informe o desconto ou marque o frete cortesia.",
  })

/** Promotion form values. */
export type PromotionFormInput = z.input<typeof promotionFormSchema>

/** Promotion values after validation. */
export type PromotionFormData = z.output<typeof promotionFormSchema>

/** Turns a promotion on or off. */
export const togglePromotionSchema = z.object({
  id: z.uuid("Promoção inválida."),
  active: z.boolean(),
})

/** Toggle values. */
export type TogglePromotionInput = z.input<typeof togglePromotionSchema>

/** Removes a promotion (soft delete). */
export const deletePromotionSchema = z.object({
  id: z.uuid("Promoção inválida."),
})

/** Delete values. */
export type DeletePromotionInput = z.input<typeof deletePromotionSchema>
