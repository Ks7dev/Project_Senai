import { z } from "zod"
import {
  isValidPhone,
  onlyDigits,
} from "@/features/shared/lib/validation/documents"

/**
 * Brazilian phone with area code, normalized to digits only: 10 digits
 * for landlines, 11 for mobiles.
 */
export const phoneSchema = z
  .string()
  .transform(onlyDigits)
  .refine(isValidPhone, "Informe um telefone válido com DDD.")
