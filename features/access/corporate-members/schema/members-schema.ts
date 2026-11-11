import { z } from "zod"
import {
  isValidCpf,
  onlyDigits,
} from "@/features/shared/lib/validation/documents"

const role = z.enum(["requester", "approver", "finance", "admin"])

/** Invite a user to the corporate account (RF09). */
export const inviteMemberSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email("E-mail inválido.")),
  roles: z.array(role).min(1, "Escolha pelo menos um perfil."),
})

/** Invite form values. */
export type InviteMemberInput = z.input<typeof inviteMemberSchema>

/** Change the roles of a member (RF10, RN08). */
export const updateMemberRolesSchema = z.object({
  memberId: z.string().min(1),
  roles: z.array(role).min(1, "Escolha pelo menos um perfil."),
})

/** Role change values. */
export type UpdateMemberRolesInput = z.input<typeof updateMemberRolesSchema>

/** Remove a member or cancel an invitation. */
export const idSchema = z.object({ id: z.string().min(1) })

/** Id values. */
export type IdInput = z.input<typeof idSchema>

/** Accept an invitation creating a new account (RF09). */
export const acceptWithSignUpSchema = z
  .object({
    invitationId: z.string().min(1),
    name: z.string().trim().min(3, "Informe o nome completo.").max(160),
    cpf: z.string().transform(onlyDigits).refine(isValidCpf, "CPF inválido."),
    phone: z
      .string()
      .transform(onlyDigits)
      .refine((v) => v.length === 10 || v.length === 11, "Telefone inválido."),
    password: z.string().min(10, "Use pelo menos 10 caracteres.").max(128),
    confirmPassword: z.string(),
    acceptTerms: z.literal(true, {
      error: "Aceite os termos de uso e a política de privacidade.",
    }),
  })
  .refine((data) => data.password === data.confirmPassword, {
    path: ["confirmPassword"],
    message: "As senhas não conferem.",
  })

/** Accept with sign-up values. */
export type AcceptWithSignUpInput = z.input<typeof acceptWithSignUpSchema>
