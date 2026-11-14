import { z } from "zod"
import { BRAZILIAN_STATES } from "@/features/shared/lib/sellers/seller-routing"

/**
 * New seller rule (RN11): the seller, the segment and the state it
 * covers. An empty segment or state means "any".
 */
export const sellerRuleSchema = z.object({
  sellerId: z.string().min(1, "Escolha o vendedor.").max(36),
  personType: z.enum(["PF", "PJ"]).or(z.literal("")),
  state: z.enum(BRAZILIAN_STATES).or(z.literal("")),
})

/** New rule values, as the form holds them. */
export type SellerRuleInput = z.input<typeof sellerRuleSchema>

/** New rule values after validation. */
export type SellerRuleData = z.output<typeof sellerRuleSchema>

/** A rule to deactivate. */
export const sellerRuleIdSchema = z.object({
  ruleId: z.uuid("Regra inválida."),
})

/** Values of the rule deactivation. */
export type SellerRuleIdInput = z.input<typeof sellerRuleIdSchema>

/** Seller of a corporate account (RN11); empty removes it. */
export const organizationSellerSchema = z.object({
  organizationId: z.string().min(1, "Conta inválida.").max(36),
  sellerId: z.string().max(36),
})

/** Values of the account seller change. */
export type OrganizationSellerInput = z.input<typeof organizationSellerSchema>

/** WhatsApp number of a seller: area code and number, digits only. */
export const sellerPhoneSchema = z.object({
  sellerId: z.string().min(1, "Vendedor inválido.").max(36),
  phone: z
    .string()
    .trim()
    .transform((value) => value.replace(/\D/g, ""))
    .pipe(
      z
        .string()
        .regex(
          /^\d{10,11}$/,
          "Informe o WhatsApp com DDD, por exemplo (11) 91234-5678."
        )
    ),
})

/** WhatsApp number values, as the form holds them. */
export type SellerPhoneInput = z.input<typeof sellerPhoneSchema>
