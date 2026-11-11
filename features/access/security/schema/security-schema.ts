import { z } from "zod"

/** Current password, required to change 2FA settings (RF40). */
export const passwordConfirmSchema = z.object({
  password: z.string().min(1, "Informe a sua senha."),
})

/** Password confirmation form values. */
export type PasswordConfirmInput = z.input<typeof passwordConfirmSchema>
