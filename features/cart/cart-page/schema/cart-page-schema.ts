import { z } from "zod"
import { cepSchema } from "@/features/shared/schema/cep-schema"
import {
  cartQuantitySchema,
  lineServicesSchema,
  personalizationSchema,
} from "@/features/shared/schema/cart-schema"

/** Laser engraving and additional services of a line (RF51, RF52). */
export const setCartItemExtrasSchema = z.object({
  itemId: z.uuid("Item inválido."),
  personalization: personalizationSchema.nullable(),
  services: lineServicesSchema,
})

/** Values of the extras form of a line. */
export type SetCartItemExtrasInput = z.input<typeof setCartItemExtrasSchema>

/** Changes the quantity of a cart line. */
export const updateCartItemSchema = z.object({
  itemId: z.uuid("Item inválido."),
  quantity: cartQuantitySchema,
})

/** Values of the quantity change. */
export type UpdateCartItemInput = z.input<typeof updateCartItemSchema>

/** Removes a cart line. */
export const removeCartItemSchema = z.object({
  itemId: z.uuid("Item inválido."),
})

/** Values of the line removal. */
export type RemoveCartItemInput = z.input<typeof removeCartItemSchema>

/** Saves the cart as a named project list (RF07). */
export const saveProjectListSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Dê um nome à lista, com ao menos 2 caracteres.")
    .max(120, "Use até 120 caracteres."),
})

/** Values of the save as project list form. */
export type SaveProjectListInput = z.input<typeof saveProjectListSchema>

/** Coupon typed by the customer in the cart (RF46). */
export const applyCouponSchema = z.object({
  code: z
    .string()
    .trim()
    .transform((value) => value.replace(/\s+/g, "").toUpperCase())
    .pipe(
      z
        .string()
        .min(3, "Informe o código do cupom.")
        .max(40, "Código de cupom inválido.")
        .regex(/^[A-Z0-9_-]+$/, "Use apenas letras, números, hífen ou _.")
    ),
})

/** Values of the coupon form. */
export type ApplyCouponInput = z.input<typeof applyCouponSchema>

/** Shipping estimate of the cart for a CEP; the lines come from the cart. */
export const cartShippingSchema = z.object({ cep: cepSchema })

/** Values of the cart shipping estimate. */
export type CartShippingInput = z.input<typeof cartShippingSchema>
