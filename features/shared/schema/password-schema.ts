import { z } from "zod"

/** Hint shown under every field that creates a password. */
export const PASSWORD_HINT =
  "Mínimo de 10 caracteres, com letra maiúscula, letra minúscula, número e caractere especial."

/**
 * New password policy, used wherever a password is created (sign-up,
 * invitation and reset): 10 to 128 characters with at least one
 * uppercase letter, one lowercase letter, one digit and one special
 * character.
 */
export const newPasswordSchema = z
  .string()
  .min(10, "Use pelo menos 10 caracteres.")
  .max(128, "Use no máximo 128 caracteres.")
  .regex(/\p{Lu}/u, "Inclua pelo menos uma letra maiúscula.")
  .regex(/\p{Ll}/u, "Inclua pelo menos uma letra minúscula.")
  .regex(/\d/, "Inclua pelo menos um número.")
  .regex(/[^\p{L}\p{N}\s]/u, "Inclua pelo menos um caractere especial.")
