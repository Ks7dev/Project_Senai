import { z } from "zod"

/** Six-digit authenticator code (RF40), used at login and on activation. */
export const twoFactorCodeSchema = z.object({
  code: z
    .string()
    .trim()
    .regex(/^\d{6}$/, "Digite os 6 números do aplicativo autenticador."),
})

/** Two-factor form values. */
export type TwoFactorCodeInput = z.input<typeof twoFactorCodeSchema>
