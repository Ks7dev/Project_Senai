import { z } from "zod"

const decimal = (message: string, max = 99_999_999.99) =>
  z
    .string()
    .trim()
    .transform((value) => value.replace(/\./g, "").replace(",", "."))
    .pipe(
      z
        .string()
        .regex(/^\d+(\.\d{1,3})?$/, message)
        .refine((v) => Number(v) > 0 && Number(v) <= max, message)
    )

const positiveInt = (message: string) =>
  z.coerce.number().int(message).min(0, message).max(1_000_000, message)

/** One SKU (variation) of the product. */
export const skuSchema = z.object({
  id: z.uuid().optional(),
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9-]{3,64}$/, "Código: 3 a 64 letras, números ou hífen."),
  name: z.string().trim().min(1, "Informe o nome da variação.").max(191),
  price: decimal("Preço inválido.").optional().or(z.literal("")),
  stock: positiveInt("Estoque inválido.").optional(),
  active: z.boolean().default(true),
})

/**
 * Product form (RF41). Weight and dimensions are mandatory because the
 * shipping calculation depends on them (RN20).
 */
export const productFormSchema = z.object({
  id: z.uuid().optional(),
  name: z.string().trim().min(3, "Informe o nome do produto.").max(191),
  slug: z
    .string()
    .trim()
    .regex(/^[a-z0-9-]*$/, "Use só letras minúsculas, números e hífen.")
    .max(191)
    .optional()
    .or(z.literal("")),
  description: z
    .string()
    .trim()
    .min(20, "Descreva o produto (mín. 20 caracteres)."),
  brand: z.string().trim().max(120).optional().or(z.literal("")),
  categoryId: z.uuid("Escolha a categoria."),
  basePrice: decimal("Preço inválido."),
  weightKg: decimal("Informe o peso em kg.", 2000),
  lengthCm: decimal("Informe o comprimento em cm.", 1000),
  widthCm: decimal("Informe a largura em cm.", 1000),
  heightCm: decimal("Informe a altura em cm.", 1000),
  warrantyMonths: positiveInt("Garantia inválida."),
  leadTimeDays: positiveInt("Prazo inválido."),
  requiresCertification: z.boolean().default(false),
  requiresInstallation: z.boolean().default(false),
  personalizable: z.boolean().default(false),
  limitedEdition: z.boolean().default(false),
  lotNumber: z.string().trim().max(60).optional().or(z.literal("")),
  specs: z
    .array(
      z.object({
        label: z.string().trim().min(1, "Informe o nome da especificação."),
        value: z.string().trim().min(1, "Informe o valor."),
      })
    )
    .max(40),
  skus: z.array(skuSchema).min(1, "Cadastre ao menos uma variação (SKU)."),
})

/** Product form values typed by the user. */
export type ProductFormInput = z.input<typeof productFormSchema>

/** Product values after validation. */
export type ProductFormData = z.output<typeof productFormSchema>

/** Publish, unpublish or inactivate a product (RF42, RN09). */
export const productStatusSchema = z.object({
  id: z.uuid(),
  status: z.enum(["DRAFT", "ACTIVE", "INACTIVE"]),
})

/** Status change values. */
export type ProductStatusInput = z.input<typeof productStatusSchema>

/** Accepted document kinds. */
export const documentKindSchema = z.enum([
  "DATASHEET",
  "CERTIFICATION",
  "MANUAL",
])
