import { z } from "zod"
import {
  INSTITUTIONAL_BODY_MAX,
  INSTITUTIONAL_SLUGS,
} from "@/features/shared/lib/content/institutional-pages"

/** Institutional page edited in the back office (RF57). */
export const institutionalPageSchema = z.object({
  slug: z.enum(INSTITUTIONAL_SLUGS, "Página inválida."),
  title: z
    .string()
    .trim()
    .min(3, "Informe o título da página.")
    .max(120, "Use até 120 caracteres."),
  body: z
    .string()
    .trim()
    .min(20, "Escreva o texto da página.")
    .max(
      INSTITUTIONAL_BODY_MAX,
      `Use até ${INSTITUTIONAL_BODY_MAX.toLocaleString("pt-BR")} caracteres.`
    ),
})

/** Values of the institutional page editor. */
export type InstitutionalPageInput = z.input<typeof institutionalPageSchema>
