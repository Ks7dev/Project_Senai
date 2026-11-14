import { z } from "zod"

/** Phrase the DPO types to confirm an anonymization. */
export const ANONYMIZE_PHRASE = "ANONIMIZAR"

/** Finds a titular by e-mail or CPF/CNPJ (RF56). */
export const privacyLookupSchema = z.object({
  query: z
    .string()
    .trim()
    .min(3, "Informe o e-mail ou o CPF/CNPJ do titular.")
    .max(191, "Busca longa demais."),
})

/** Values of the titular search. */
export type PrivacyLookupInput = z.input<typeof privacyLookupSchema>

/** A titular chosen in the search. */
export const privacySubjectSchema = z.object({
  userId: z.string().trim().min(1, "Titular inválido.").max(36),
})

/** Values of the export of a titular. */
export type PrivacySubjectInput = z.input<typeof privacySubjectSchema>

/**
 * Anonymization asked by the titular through the service channel: the
 * protocol of the request and the confirmation phrase.
 */
export const privacyAnonymizeSchema = privacySubjectSchema.extend({
  protocol: z
    .string()
    .trim()
    .min(3, "Informe o protocolo ou a origem da solicitação.")
    .max(120, "Use até 120 caracteres."),
  confirmation: z
    .string()
    .trim()
    .refine(
      (value) => value.toUpperCase() === ANONYMIZE_PHRASE,
      `Digite ${ANONYMIZE_PHRASE} para confirmar.`
    ),
})

/** Values of the anonymization form. */
export type PrivacyAnonymizeInput = z.input<typeof privacyAnonymizeSchema>
