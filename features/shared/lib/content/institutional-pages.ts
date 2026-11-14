/** Routes of the institutional pages (RF57). */
export const INSTITUTIONAL_SLUGS = [
  "termos-de-uso",
  "politica-de-privacidade",
  "trocas-e-devolucoes",
  "garantia",
] as const

/** Route of an institutional page. */
export type InstitutionalSlug = (typeof INSTITUTIONAL_SLUGS)[number]

/** Default title of each page, used before the admin saves one. */
export const INSTITUTIONAL_TITLES: Record<InstitutionalSlug, string> = {
  "termos-de-uso": "Termos de uso",
  "politica-de-privacidade": "Política de privacidade",
  "trocas-e-devolucoes": "Trocas e devoluções",
  garantia: "Garantia",
}

/** Cache tag of the institutional pages, invalidated when the admin saves. */
export const INSTITUTIONAL_CACHE_TAG = "institutional-pages"

/** Largest body accepted, in characters. */
export const INSTITUTIONAL_BODY_MAX = 50_000

/** An institutional page as the store shows it. */
export type InstitutionalPageContent = {
  /** Route. */
  slug: InstitutionalSlug
  /** Title. */
  title: string
  /** Body in the small Markdown subset. */
  body: string
  /** Last change, ISO string, or null when never saved. */
  updatedAt: string | null
}

/**
 * Whether a string is the route of an institutional page.
 *
 * @param value - Any string.
 * @returns True for a known slug.
 */
export function isInstitutionalSlug(value: string): value is InstitutionalSlug {
  return (INSTITUTIONAL_SLUGS as readonly string[]).includes(value)
}
