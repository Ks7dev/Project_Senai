import { z } from "zod"

/** Rows shown per page of the audit log. */
export const AUDIT_PAGE_SIZE = 50

/** Areas (audited entities) offered in the filter, with their labels. */
export const AUDIT_ENTITY_LABELS: Record<string, string> = {
  order: "Pedidos e aprovações",
  payment: "Pagamentos",
  product: "Produtos e preços",
  sku: "Variações (SKU) e estoque",
  category: "Categorias",
  promotion: "Promoções",
  quote: "Cotações",
  setting: "Configurações",
  shipping_region: "Regiões de entrega",
  user: "Usuários, perfis e LGPD",
  organization: "Contas corporativas",
  address: "Endereços",
  institutional_page: "Conteúdo e páginas institucionais",
}

/** Date typed in a date field (aaaa-mm-dd). */
const dateField = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida.")
  .optional()
  .or(z.literal("").transform(() => undefined))

/**
 * Filters of the audit log viewer (RNF12): area, action, user, period
 * and page. Everything is optional; the default is the latest rows.
 */
export const auditLogFiltersSchema = z
  .object({
    entity: z
      .string()
      .trim()
      .max(64)
      .regex(/^[a-z_]*$/, "Área inválida.")
      .optional()
      .default(""),
    action: z
      .string()
      .trim()
      .max(100)
      .regex(/^[a-z_.]*$/, "Use letras minúsculas, ponto e sublinhado.")
      .optional()
      .default(""),
    user: z.string().trim().max(120).optional().default(""),
    entityId: z.string().trim().max(36).optional().default(""),
    from: dateField,
    to: dateField,
    page: z.coerce.number().int().min(1).max(1000).optional().default(1),
  })
  .refine((value) => !value.from || !value.to || value.from <= value.to, {
    message: "A data inicial deve ser anterior à final.",
    path: ["to"],
  })

/** Filters before validation (as read from the URL). */
export type AuditLogFiltersInput = z.input<typeof auditLogFiltersSchema>

/** Filters after validation. */
export type AuditLogFilters = z.output<typeof auditLogFiltersSchema>
