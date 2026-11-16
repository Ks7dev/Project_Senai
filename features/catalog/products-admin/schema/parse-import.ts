import {
  IMPORT_COLUMNS,
  MAX_IMPORT_ROWS,
} from "@/features/catalog/products-admin/schema/import-schema"
import {
  productFormSchema,
  type ProductFormData,
} from "@/features/catalog/products-admin/schema/product-schema"

/** A CSV line converted into product data, or its validation errors. */
export type ParsedLine =
  | { line: number; ok: true; categorySlug: string; data: ProductFormData }
  | { line: number; ok: false; message: string }

/**
 * Validates the CSV lines with the same rules as the product form
 * (#21): required weight and dimensions, prices, SKU codes. Each line
 * is independent, so one bad line never blocks the others (#29).
 *
 * @param rows - Parsed CSV rows, header first.
 * @returns One result per data line, or a header error.
 */
export function parseImportRows(
  rows: string[][]
): { lines: ParsedLine[] } | { error: string } {
  const header = (rows[0] ?? []).map((name) => name.trim().toLowerCase())
  const missing = IMPORT_COLUMNS.filter((column) => !header.includes(column))
  if (missing.length > 0) {
    return {
      error: `Colunas ausentes no cabeçalho: ${missing.join(", ")}. Use o modelo para download.`,
    }
  }
  if (rows.length - 1 > MAX_IMPORT_ROWS) {
    return { error: `O arquivo pode ter no máximo ${MAX_IMPORT_ROWS} linhas.` }
  }
  const index = Object.fromEntries(header.map((name, i) => [name, i]))
  const value = (row: string[], column: string) =>
    (row[index[column]] ?? "").trim()

  const lines = rows.slice(1).map((row, i): ParsedLine => {
    const line = i + 2
    const categorySlug = value(row, "categoria_slug")
    if (!categorySlug) {
      return {
        line,
        ok: false,
        message: "categoria_slug: informe a categoria.",
      }
    }
    const parsed = productFormSchema.safeParse({
      slug: value(row, "slug"),
      name: value(row, "nome"),
      description: value(row, "descricao"),
      brand: value(row, "marca"),
      categoryId: "00000000-0000-7000-8000-000000000000",
      basePrice: value(row, "preco"),
      weightKg: value(row, "peso_kg"),
      lengthCm: value(row, "comprimento_cm"),
      widthCm: value(row, "largura_cm"),
      heightCm: value(row, "altura_cm"),
      warrantyMonths: value(row, "garantia_meses") || "3",
      leadTimeDays: value(row, "prazo_dias") || "5",
      specs: [],
      skus: [
        {
          code: value(row, "sku"),
          name: value(row, "nome_variacao") || "Padrão",
          stock: value(row, "estoque_inicial") || "0",
          active: true,
        },
      ],
    })
    if (!parsed.success) {
      const message = parsed.error.issues
        .map((issue) => {
          const column =
            COLUMN_OF[String(issue.path.at(-1))] ?? String(issue.path[0])
          return `${column}: ${issue.message}`
        })
        .join("; ")
      return { line, ok: false, message }
    }
    return { line, ok: true, categorySlug, data: parsed.data }
  })
  return { lines }
}

const COLUMN_OF: Record<string, string> = {
  slug: "slug",
  name: "nome",
  description: "descricao",
  brand: "marca",
  basePrice: "preco",
  weightKg: "peso_kg",
  lengthCm: "comprimento_cm",
  widthCm: "largura_cm",
  heightCm: "altura_cm",
  warrantyMonths: "garantia_meses",
  leadTimeDays: "prazo_dias",
  code: "sku",
  stock: "estoque_inicial",
}
