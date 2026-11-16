import { z } from "zod"

const id = z.uuid("Categoria inválida.")

/** Create or edit a category (RF01). */
export const categoryFormSchema = z.object({
  id: id.optional(),
  name: z.string().trim().min(2, "Informe o nome.").max(120),
  slug: z
    .string()
    .trim()
    .max(160)
    .regex(/^[a-z0-9-]*$/, "Use só letras minúsculas, números e hífen.")
    .optional()
    .or(z.literal("")),
  parentId: id.optional().or(z.literal("")),
  active: z.boolean().default(true),
})

/** Category form values. */
export type CategoryFormInput = z.input<typeof categoryFormSchema>

/** Move a category one position up or down among its siblings. */
export const moveCategorySchema = z.object({
  id,
  direction: z.enum(["up", "down"]),
})

/** Move action values. */
export type MoveCategoryInput = z.input<typeof moveCategorySchema>

/** Activate or deactivate a category. */
export const toggleCategorySchema = z.object({ id, active: z.boolean() })

/** Toggle action values. */
export type ToggleCategoryInput = z.input<typeof toggleCategorySchema>
