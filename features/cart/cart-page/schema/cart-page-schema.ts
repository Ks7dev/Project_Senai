import { z } from "zod"
import { cartQuantitySchema } from "@/features/shared/schema/cart-schema"

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
