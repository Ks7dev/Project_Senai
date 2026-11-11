import { z } from "zod"

/** Products per page in listings and search. */
export const PAGE_SIZE = 24

/** Sort options of the listing (RF02). */
export const SORT_OPTIONS = {
  recentes: "Mais recentes",
  "menor-preco": "Menor preço",
  "maior-preco": "Maior preço",
  nome: "Nome (A–Z)",
} as const

/** Sort key. */
export type SortKey = keyof typeof SORT_OPTIONS

/** Lead time buckets used by the delivery filter (RF02). */
export const LEAD_TIME_OPTIONS = {
  "pronta-entrega": { label: "Pronta-entrega (até 5 dias)", maxDays: 5 },
  "ate-15-dias": { label: "Até 15 dias", maxDays: 15 },
  "ate-30-dias": { label: "Até 30 dias", maxDays: 30 },
} as const

/** Lead time key. */
export type LeadTimeKey = keyof typeof LEAD_TIME_OPTIONS

/** SKU attribute keys that hold the material or finish. */
export const MATERIAL_ATTRIBUTE_KEYS = ["acabamento", "material", "cor"]

const list = z
  .union([z.string(), z.array(z.string())])
  .optional()
  .transform((value) =>
    (Array.isArray(value) ? value : value ? [value] : [])
      .map((item) => item.trim())
      .filter(Boolean)
      .slice(0, 20)
  )

const money = z
  .string()
  .optional()
  .transform((value) => {
    if (!value) return undefined
    const number = Number(value.replace(",", "."))
    return Number.isFinite(number) && number >= 0 ? number : undefined
  })

/**
 * Listing and search filters read from the URL, so every filter is
 * shareable and survives reloads (RF02). Invalid values are ignored.
 */
export const catalogFiltersSchema = z.object({
  q: z
    .string()
    .optional()
    .transform((value) => value?.trim().slice(0, 100) || undefined),
  marca: list,
  material: list,
  min: money,
  max: money,
  prazo: z
    .enum(Object.keys(LEAD_TIME_OPTIONS) as [LeadTimeKey, ...LeadTimeKey[]])
    .optional()
    .catch(undefined),
  ordem: z
    .enum(Object.keys(SORT_OPTIONS) as [SortKey, ...SortKey[]])
    .default("recentes")
    .catch("recentes"),
  pagina: z.coerce.number().int().min(1).max(500).default(1).catch(1),
})

/** Parsed filters. */
export type CatalogFilters = z.output<typeof catalogFiltersSchema>

/**
 * Parses the page search params into filters.
 *
 * @param params - Raw search params.
 * @returns Valid filters with defaults.
 */
export function parseCatalogFilters(
  params: Record<string, string | string[] | undefined>
): CatalogFilters {
  return catalogFiltersSchema.parse(params)
}

/**
 * Builds the query string of a filter state, used by filter links and
 * pagination so the URL always reflects the filters (RF02).
 *
 * @param filters - Filters to encode.
 * @param changes - Values to override; `undefined` removes the key.
 * @returns The query string, starting with "?" or empty.
 */
export function filtersToQuery(
  filters: CatalogFilters,
  changes: Partial<Record<keyof CatalogFilters, unknown>> = {}
): string {
  const merged = { ...filters, ...changes } as Record<string, unknown>
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(merged)) {
    if (value === undefined || value === "" || value === null) continue
    if (key === "ordem" && value === "recentes") continue
    if (key === "pagina" && value === 1) continue
    if (Array.isArray(value))
      value.forEach((v) => params.append(key, String(v)))
    else params.set(key, String(value))
  }
  const query = params.toString()
  return query ? `?${query}` : ""
}

/**
 * Adds or removes a value from a multi-value filter.
 *
 * @param values - Current values.
 * @param value - Value to toggle.
 * @returns The new list.
 */
export function toggleValue(values: string[], value: string): string[] {
  return values.includes(value)
    ? values.filter((item) => item !== value)
    : [...values, value]
}
