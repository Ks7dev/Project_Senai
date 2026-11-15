import { z } from "zod"
import { cepSchema } from "@/features/shared/schema/cep-schema"

const money = z
  .string()
  .trim()
  .transform((value) => value.replace(",", "."))
  .pipe(z.string().regex(/^\d{1,10}(\.\d{1,2})?$/, "Valor inválido."))

/** One line of the own delivery price table (RF50). */
export const regionRateSchema = z.object({
  maxKg: z
    .string()
    .trim()
    .transform((value) => value.replace(",", "."))
    .pipe(
      z
        .string()
        .regex(/^\d{1,6}(\.\d{1,3})?$/, "Peso inválido.")
        .transform(Number)
        .refine((value) => value > 0, "Peso deve ser maior que zero.")
    ),
  price: money,
})

/**
 * CEP range of a delivery region, editable in the back office (RF50,
 * RN16): own delivery and assembly flag, price table by weight and the
 * regional free shipping minimum (RN23, applied by #73).
 */
export const regionFormSchema = z
  .object({
    id: z.uuid().optional(),
    name: z.string().trim().min(2, "Informe o nome da região.").max(120),
    cepStart: cepSchema,
    cepEnd: cepSchema,
    ownDelivery: z.boolean().default(false),
    rates: z.array(regionRateSchema).max(20, "Use no máximo 20 faixas."),
    freeShippingMinimum: money.optional().or(z.literal("")),
    active: z.boolean().default(true),
  })
  .refine((region) => region.cepStart <= region.cepEnd, {
    path: ["cepEnd"],
    message: "O CEP final deve ser maior ou igual ao inicial.",
  })
  .refine((region) => !region.ownDelivery || region.rates.length > 0, {
    path: ["rates"],
    message: "Informe ao menos uma faixa de peso para a entrega própria.",
  })
  .refine(
    (region) =>
      new Set(region.rates.map((rate) => rate.maxKg)).size ===
      region.rates.length,
    { path: ["rates"], message: "Há faixas de peso repetidas." }
  )

/** Region form values. */
export type RegionFormInput = z.input<typeof regionFormSchema>

/** Region values after validation. */
export type RegionFormData = z.output<typeof regionFormSchema>

/** Activate or deactivate a region. */
export const toggleRegionSchema = z.object({
  id: z.uuid(),
  active: z.boolean(),
})

/** Toggle action values. */
export type ToggleRegionInput = z.input<typeof toggleRegionSchema>
