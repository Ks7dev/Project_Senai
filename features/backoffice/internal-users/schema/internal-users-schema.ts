import { z } from "zod"

/**
 * Internal profiles of a user (RF55). The user is found by the e-mail
 * of an existing account; an empty list removes the back office access.
 */
export const internalUserRolesSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .pipe(z.email("Informe um e-mail válido.")),
  roles: z
    .array(z.string().regex(/^[a-z_]{2,64}$/, "Perfil inválido."))
    .max(20, "Perfis demais.")
    .refine((keys) => new Set(keys).size === keys.length, "Perfil repetido."),
})

/** Form values typed by the administrator. */
export type InternalUserRolesInput = z.input<typeof internalUserRolesSchema>
