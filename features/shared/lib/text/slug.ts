/**
 * Builds a URL slug from a Portuguese name: lowercase, without
 * accents, words joined by hyphens.
 *
 * @param value - Name, e.g. "Organização de Mesa".
 * @returns The slug, e.g. "organizacao-de-mesa".
 */
export function slugify(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 160)
}
