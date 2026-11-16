import { z } from "zod"
import { onlyDigits } from "@/features/shared/lib/validation/documents"

/** Message shown when the CEP does not have 8 digits (RF24). */
export const INVALID_CEP_MESSAGE = "CEP deve ter 8 números."

/**
 * Whether a CEP has the 8 digits required before any lookup (RF24).
 * Punctuation is ignored, so "01310-100" is valid.
 *
 * @param value - CEP as typed.
 * @returns True when it has exactly 8 digits.
 */
export function isValidCep(value: string): boolean {
  return /^\d{8}$/.test(onlyDigits(value))
}

/**
 * Formats a CEP as "00000-000" for display.
 *
 * @param value - CEP with or without punctuation.
 * @returns The formatted CEP, or the digits when incomplete.
 */
export function formatCep(value: string): string {
  return onlyDigits(value).replace(/^(\d{5})(\d{3})$/, "$1-$2")
}

/** CEP with 8 digits, stored and sent without punctuation (RF24). */
export const cepSchema = z
  .string(INVALID_CEP_MESSAGE)
  .transform(onlyDigits)
  .refine((value) => value.length === 8, INVALID_CEP_MESSAGE)

/** Address lookup by CEP (RF22). */
export const cepLookupSchema = z.object({ cep: cepSchema })

/** Address lookup values. */
export type CepLookupInput = z.input<typeof cepLookupSchema>
