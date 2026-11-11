import { z } from "zod"
import { onlyDigits } from "@/features/shared/lib/validation/documents"

/** Brazilian states (UF). */
export const STATES = [
  "AC",
  "AL",
  "AM",
  "AP",
  "BA",
  "CE",
  "DF",
  "ES",
  "GO",
  "MA",
  "MG",
  "MS",
  "MT",
  "PA",
  "PB",
  "PE",
  "PI",
  "PR",
  "RJ",
  "RN",
  "RO",
  "RR",
  "RS",
  "SC",
  "SE",
  "SP",
  "TO",
] as const

/**
 * Delivery address with a nickname: head office, branch or
 * construction site (RF26).
 */
export const addressSchema = z.object({
  id: z.uuid().optional(),
  label: z.string().trim().min(2, "Dê um apelido (ex.: Matriz).").max(80),
  recipient: z.string().trim().min(3, "Informe quem recebe.").max(160),
  cep: z
    .string()
    .transform(onlyDigits)
    .refine((v) => v.length === 8, "CEP deve ter 8 números."),
  street: z.string().trim().min(2, "Informe a rua.").max(191),
  number: z.string().trim().min(1, "Informe o número (ou S/N).").max(20),
  complement: z.string().trim().max(120).optional().or(z.literal("")),
  district: z.string().trim().min(2, "Informe o bairro.").max(120),
  city: z.string().trim().min(2, "Informe a cidade.").max(120),
  state: z.enum(STATES, "Escolha o estado."),
  isDefault: z.boolean().default(false),
})

/** Address form values. */
export type AddressInput = z.input<typeof addressSchema>

/** Address values after validation. */
export type AddressData = z.output<typeof addressSchema>

/** Address id for delete and default actions. */
export const addressIdSchema = z.object({ id: z.uuid() })

/** Address id values. */
export type AddressIdInput = z.input<typeof addressIdSchema>
