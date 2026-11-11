import { z } from "zod"

/** Picks one of the customer's saved project lists (RF07). */
export const projectListIdSchema = z.object({
  listId: z.uuid("Lista inválida."),
})

/** Values of the resume and delete actions. */
export type ProjectListIdInput = z.input<typeof projectListIdSchema>
