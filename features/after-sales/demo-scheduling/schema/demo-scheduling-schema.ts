import { z } from "zod"
import { DATE_KEY_PATTERN } from "@/features/shared/lib/delivery/installation-calendar"
import {
  DEMO_MODES,
  TIME_SLOT_PATTERN,
} from "@/features/shared/lib/demos/demo-calendar"

/** Longest note of the customer. */
export const DEMO_NOTES_MAX = 1000

/** Query string of the demonstration page: the product, if any. */
export const demoSourceSchema = z.object({
  produto: z
    .string()
    .trim()
    .max(191)
    .regex(/^[a-z0-9-]+$/)
    .optional()
    .catch(undefined),
})

/** Values of the demonstration page query string. */
export type DemoSource = z.input<typeof demoSourceSchema>

/**
 * Demonstration request (RF19): the date and time picked in the agenda,
 * the format, the product (optional), a phone for the contact and
 * notes about the project.
 */
export const demoRequestSchema = z.object({
  date: z.string().regex(DATE_KEY_PATTERN, "Escolha a data."),
  time: z.string().regex(TIME_SLOT_PATTERN, "Escolha o horário."),
  mode: z.enum(DEMO_MODES, "Escolha o formato da demonstração."),
  productSlug: z
    .string()
    .trim()
    .max(191)
    .regex(/^[a-z0-9-]*$/, "Produto inválido.")
    .optional()
    .default(""),
  phone: z
    .string()
    .trim()
    .transform((value) => value.replace(/\D/g, ""))
    .pipe(
      z
        .string()
        .regex(/^(\d{10,11})?$/, "Informe o telefone com DDD ou deixe vazio.")
    )
    .optional()
    .default(""),
  notes: z
    .string()
    .trim()
    .max(DEMO_NOTES_MAX, `Use no máximo ${DEMO_NOTES_MAX} caracteres.`)
    .optional()
    .default(""),
})

/** Request values, as the form holds them. */
export type DemoRequestInput = z.input<typeof demoRequestSchema>

/** Request values after validation. */
export type DemoRequestData = z.output<typeof demoRequestSchema>
