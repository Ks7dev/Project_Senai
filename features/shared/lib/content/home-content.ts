import { z } from "zod"

/** One slide of the home carousel (RF47). */
export const homeSlideSchema = z.object({
  id: z.string().min(1),
  eyebrow: z.string().trim().max(60).optional().or(z.literal("")),
  title: z.string().trim().min(3, "Informe o título do slide.").max(120),
  subtitle: z.string().trim().max(240).optional().or(z.literal("")),
  ctaLabel: z.string().trim().max(40).optional().or(z.literal("")),
  ctaHref: z
    .string()
    .trim()
    .regex(/^\/[^/\\]/, "Use um link interno, começando com /.")
    .optional()
    .or(z.literal("")),
  imageKey: z
    .string()
    .regex(/^content\/[a-z0-9/_-]+$/i)
    .optional()
    .or(z.literal("")),
  imageAlt: z.string().trim().max(191).optional().or(z.literal("")),
})

/** A product showcase of the home (RF47). */
export const homeShowcaseSchema = z.object({
  id: z.string().min(1),
  title: z.string().trim().min(3, "Informe o título da vitrine.").max(120),
  productSlugs: z
    .array(
      z
        .string()
        .trim()
        .regex(/^[a-z0-9-]+$/, "Slug inválido.")
    )
    .max(12, "Use no máximo 12 produtos por vitrine."),
})

/** Editable home content: carousel slides and product showcases. */
export const homeContentSchema = z.object({
  slides: z.array(homeSlideSchema).min(1, "Mantenha ao menos um slide.").max(6),
  showcases: z.array(homeShowcaseSchema).max(4),
})

/** Home content. */
export type HomeContent = z.output<typeof homeContentSchema>

/** Home slide. */
export type HomeSlide = z.output<typeof homeSlideSchema>

/** Setting key that stores the home content. */
export const HOME_CONTENT_KEY = "content.home"

/** Cache tag invalidated when the home content changes. */
export const CONTENT_CACHE_TAG = "content"

/** Content used until the admin saves the first version. */
export const DEFAULT_HOME_CONTENT: HomeContent = {
  slides: [
    {
      id: "slide-1",
      eyebrow: "Curadoria Atelier Bureau",
      title: "O escritório como obra de autor",
      subtitle:
        "Papelaria nobre, escrita fina e mobiliário executivo para quem cuida dos detalhes.",
      ctaLabel: "Conhecer a coleção",
      ctaHref: "/categoria/papelaria-nobre",
      imageKey: "",
      imageAlt: "",
    },
    {
      id: "slide-2",
      eyebrow: "Projetos corporativos",
      title: "Cotação sob medida para a sua empresa",
      subtitle:
        "Conta corporativa com aprovação, faturamento em 28/56 dias e vendedor dedicado.",
      ctaLabel: "Solicitar cotação",
      ctaHref: "/cotacao/nova",
      imageKey: "",
      imageAlt: "",
    },
  ],
  showcases: [
    {
      id: "showcase-1",
      title: "Escolhas do ateliê",
      productSlugs: [
        "caneta-tinteiro-heritage",
        "organizador-modular-nogueira",
        "luminaria-articulada-latao",
        "caderno-couro-toscano-a5",
      ],
    },
  ],
}

/**
 * Validates a stored home content value, falling back to the default
 * when it is missing or invalid, so the home always renders.
 *
 * @param value - Raw JSON from the settings table.
 * @returns Valid home content.
 */
export function parseHomeContent(value: unknown): HomeContent {
  const parsed = homeContentSchema.safeParse(value)
  return parsed.success ? parsed.data : DEFAULT_HOME_CONTENT
}
