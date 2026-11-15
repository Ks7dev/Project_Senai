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
