import { z } from "zod"

/** Order whose tracking the customer opens (RF15). */
export const orderTrackingSchema = z.object({
  orderId: z.uuid("Pedido inválido."),
})

/** Values of the order tracking request. */
export type OrderTrackingInput = z.input<typeof orderTrackingSchema>
