import { z } from "zod"
import { MAX_LINE_QUANTITY } from "@/features/shared/lib/cart/cart-math"

/** Message shown for an invalid quantity. */
export const INVALID_QUANTITY_MESSAGE = `Informe uma quantidade entre 1 e ${MAX_LINE_QUANTITY}.`

/** Quantity of a cart line. */
export const cartQuantitySchema = z
  .number(INVALID_QUANTITY_MESSAGE)
  .int(INVALID_QUANTITY_MESSAGE)
  .min(1, INVALID_QUANTITY_MESSAGE)
  .max(MAX_LINE_QUANTITY, INVALID_QUANTITY_MESSAGE)

/** Adds a product variation to the cart (RF07). */
export const addToCartSchema = z.object({
  skuCode: z.string().trim().min(1, "Produto inválido.").max(64),
  quantity: cartQuantitySchema.default(1),
})

/** Values of the add to cart action. */
export type AddToCartInput = z.input<typeof addToCartSchema>

/** Engraving typefaces offered in the preview (RF51). */
export const ENGRAVING_FONTS = ["serif", "script"] as const

/** Largest engraving text the schema accepts; the setting may be lower. */
export const ENGRAVING_HARD_MAX_LENGTH = 60

/** Laser engraving chosen for a cart line (RF51). */
export const personalizationSchema = z.object({
  type: z.literal("laser_engraving"),
  text: z
    .string()
    .trim()
    .min(1, "Digite o texto da gravação.")
    .max(ENGRAVING_HARD_MAX_LENGTH, "Texto de gravação longo demais."),
  font: z.enum(ENGRAVING_FONTS, "Escolha o estilo da gravação."),
})

/** Laser engraving of a line. */
export type Personalization = z.infer<typeof personalizationSchema>

/** Keys of the additional services chosen for a line (RF52). */
export const lineServicesSchema = z
  .array(z.string().trim().min(1).max(60))
  .max(10)

const moneySchema = z
  .string()
  .trim()
  .regex(/^\d{1,10}(\.\d{1,2})?$/, "Valor inválido.")

/** Laser engraving rule stored in the settings table (RF51). */
export const engravingRuleSchema = z.object({
  price: moneySchema,
  extraBusinessDays: z.number().int().min(0).max(60),
  maxLength: z.number().int().min(1).max(ENGRAVING_HARD_MAX_LENGTH),
})

/** Laser engraving rule. */
export type EngravingRule = z.infer<typeof engravingRuleSchema>

/** Which products accept an additional service. */
export const SERVICE_ELIGIBILITY = [
  "all",
  "installation",
  "personalizable",
] as const

/** Additional service rule stored in the settings table (RF52). */
export const serviceRuleSchema = z.object({
  key: z.string().trim().min(1).max(60),
  label: z.string().trim().min(1).max(80),
  description: z.string().trim().max(200).default(""),
  price: moneySchema,
  courtesy: z.boolean().default(false),
  extraBusinessDays: z.number().int().min(0).max(60).default(0),
  eligibility: z.enum(SERVICE_ELIGIBILITY).default("all"),
})

/** Additional service rule. */
export type ServiceRule = z.infer<typeof serviceRuleSchema>

/** Every additional service offered in the cart. */
export const serviceRulesSchema = z.array(serviceRuleSchema)
