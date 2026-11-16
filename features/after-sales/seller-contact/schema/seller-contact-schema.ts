import { z } from "zod"

/** Query string of the seller contact page: product or cart (RF18). */
export const sellerContactSourceSchema = z.object({
  /** Product slug, when the customer came from the product page. */
  produto: z
    .string()
    .trim()
    .max(191)
    .regex(/^[a-z0-9-]+$/)
    .optional()
    .catch(undefined),
  /** "carrinho" when the customer came from the cart. */
  origem: z.enum(["carrinho"]).optional().catch(undefined),
})

/** Values of the seller contact page query string. */
export type SellerContactSource = z.input<typeof sellerContactSourceSchema>
