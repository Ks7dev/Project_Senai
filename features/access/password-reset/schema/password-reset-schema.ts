import { z } from "zod"
import { newPasswordSchema } from "@/features/shared/schema/password-schema"

/** Request a reset link by e-mail (RF40). */
export const requestResetSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email("E-mail inválido.")),
})

/** Request reset form values. */
export type RequestResetInput = z.input<typeof requestResetSchema>

/** New password with the token received by e-mail (RF40). */
export const resetPasswordSchema = z
  .object({
    token: z.string().min(1, "Link inválido."),
    password: newPasswordSchema,
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    path: ["confirmPassword"],
    message: "As senhas não conferem.",
  })

/** Reset password form values. */
export type ResetPasswordInput = z.input<typeof resetPasswordSchema>
