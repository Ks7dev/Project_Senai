import { z } from "zod"

/** Login form (RF39). */
export const signInSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email("E-mail inválido.")),
  password: z.string().min(1, "Informe a senha."),
})

/** Login form values. */
export type SignInInput = z.input<typeof signInSchema>
