import { z } from "zod"

/** Decision of the sales team on a demonstration (RF19). */
export const demoDecisionSchema = z
  .object({
    requestId: z.uuid("Solicitação inválida."),
    status: z.enum(["CONFIRMED", "CANCELED", "DONE"], "Escolha a situação."),
    note: z
      .string()
      .trim()
      .max(1000, "Use no máximo 1000 caracteres.")
      .optional()
      .default(""),
  })
  .refine((value) => value.status !== "CANCELED" || value.note.length >= 5, {
    path: ["note"],
    message: "Explique ao cliente o motivo do cancelamento.",
  })

/** Decision values, as the form holds them. */
export type DemoDecisionInput = z.input<typeof demoDecisionSchema>

/** Filters of the demonstration list. */
export const DEMO_DESK_FILTERS = ["UPCOMING", "ALL"] as const

/** A filter of the demonstration list. */
export type DemoDeskFilter = (typeof DEMO_DESK_FILTERS)[number]

/** Query of the demonstration list. */
export const demoDeskQuerySchema = z.object({
  filter: z.enum(DEMO_DESK_FILTERS).catch("UPCOMING"),
})

/** Values of the demonstration list query. */
export type DemoDeskQueryInput = z.input<typeof demoDeskQuerySchema>
