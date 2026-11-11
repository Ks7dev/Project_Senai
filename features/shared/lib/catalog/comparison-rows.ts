import type { ProductCardData } from "@/features/shared/lib/catalog/catalog-query"

/** A product in the comparison table (RF04). */
export type ComparisonProduct = ProductCardData & {
  /** Warranty in months. */
  warrantyMonths: number
  /** Technical specifications by label. */
  specs: Record<string, string>
}

/**
 * Rows of the comparison table: fixed attributes first, then every
 * specification label found in any product, with "—" when a product
 * does not have it (RF04).
 *
 * @param products - Compared products.
 * @returns Label and one value per product.
 */
export function buildComparisonRows(
  products: ComparisonProduct[]
): Array<{ label: string; values: string[] }> {
  const brl = new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  })
  const labels = [...new Set(products.flatMap((p) => Object.keys(p.specs)))]
  return [
    {
      label: "Preço",
      values: products.map((p) => brl.format(Number(p.price))),
    },
    { label: "Marca", values: products.map((p) => p.brand ?? "—") },
    {
      label: "Disponibilidade",
      values: products.map((p) =>
        p.available ? "Em estoque" : "Sob encomenda"
      ),
    },
    {
      label: "Prazo",
      values: products.map((p) => `${p.leadTimeDays} dias úteis`),
    },
    {
      label: "Garantia",
      values: products.map(
        (p) => `${p.warrantyMonths} ${p.warrantyMonths === 1 ? "mês" : "meses"}`
      ),
    },
    ...labels.map((label) => ({
      label,
      values: products.map((p) => p.specs[label] ?? "—"),
    })),
  ]
}
