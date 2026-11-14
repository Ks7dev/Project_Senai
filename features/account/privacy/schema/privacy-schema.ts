import { z } from "zod"

/** Phrase the customer types to confirm the deletion. */
export const DELETION_PHRASE = "EXCLUIR"

/**
 * Deletion of the personal data (RF56): the current password and the
 * confirmation phrase, so a forgotten open session cannot erase the
 * account.
 */
export const deleteMyDataSchema = z.object({
  password: z.string().min(1, "Informe a sua senha."),
  confirmation: z
    .string()
    .trim()
    .refine(
      (value) => value.toUpperCase() === DELETION_PHRASE,
      `Digite ${DELETION_PHRASE} para confirmar.`
    ),
})

/** Values of the deletion form. */
export type DeleteMyDataInput = z.input<typeof deleteMyDataSchema>
