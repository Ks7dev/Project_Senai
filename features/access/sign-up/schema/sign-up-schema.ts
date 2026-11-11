import { z } from "zod"
import {
  isValidCnpj,
  isValidCpf,
  onlyDigits,
} from "@/features/shared/lib/validation/documents"

const password = z
  .string()
  .min(10, "Use pelo menos 10 caracteres.")
  .max(128, "Use no máximo 128 caracteres.")

const cpf = z.string().transform(onlyDigits).refine(isValidCpf, "CPF inválido.")

const phone = z
  .string()
  .transform(onlyDigits)
  .refine((v) => v.length === 10 || v.length === 11, "Telefone inválido.")

const common = {
  name: z.string().trim().min(3, "Informe o nome completo.").max(160),
  email: z.string().trim().toLowerCase().pipe(z.email("E-mail inválido.")),
  password,
  confirmPassword: z.string(),
  acceptTerms: z.literal(true, {
    error: "Aceite os termos de uso e a política de privacidade.",
  }),
}

/** Individual customer (PF): CPF required, phone optional (RF39). */
const individualSchema = z.object({
  personType: z.literal("PF"),
  ...common,
  cpf,
  phone: phone.optional().or(z.literal("").transform(() => undefined)),
})

/**
 * Corporate customer (PJ): CNPJ, legal name, responsible person's CPF
 * and phone are required (RF39). The CNPJ creates the corporate
 * account, whose first user is its administrator and approver (RN08).
 */
const corporateSchema = z.object({
  personType: z.literal("PJ"),
  ...common,
  cpf,
  phone,
  cnpj: z.string().transform(onlyDigits).refine(isValidCnpj, "CNPJ inválido."),
  legalName: z.string().trim().min(2, "Informe a razão social.").max(191),
})

/** Sign-up form, validated on the client and again in the action. */
export const signUpSchema = z
  .discriminatedUnion("personType", [individualSchema, corporateSchema])
  .superRefine((data, ctx) => {
    if (data.password !== data.confirmPassword) {
      ctx.addIssue({
        code: "custom",
        path: ["confirmPassword"],
        message: "As senhas não conferem.",
      })
    }
  })

/** Raw form values typed by the user. */
export type SignUpInput = z.input<typeof signUpSchema>

/** Values after validation and normalization (digits only). */
export type SignUpData = z.output<typeof signUpSchema>
