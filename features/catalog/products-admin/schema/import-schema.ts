/** Columns of the product import CSV (#29), in template order. */
export const IMPORT_COLUMNS = [
  "slug",
  "nome",
  "descricao",
  "categoria_slug",
  "marca",
  "preco",
  "peso_kg",
  "comprimento_cm",
  "largura_cm",
  "altura_cm",
  "garantia_meses",
  "prazo_dias",
  "sku",
  "nome_variacao",
  "estoque_inicial",
] as const

/** Import column name. */
export type ImportColumn = (typeof IMPORT_COLUMNS)[number]

/** Example row of the template. */
export const TEMPLATE_EXAMPLE: Record<ImportColumn, string> = {
  slug: "caderno-linho-a5",
  nome: "Caderno em linho A5",
  descricao:
    "Caderno com capa em linho, costura aparente e papel pólen 90 g/m².",
  categoria_slug: "papelaria-nobre",
  marca: "Atelier Bureau",
  preco: "249,00",
  peso_kg: "0,400",
  comprimento_cm: "22",
  largura_cm: "16",
  altura_cm: "2",
  garantia_meses: "6",
  prazo_dias: "5",
  sku: "PAP-CAD-LIN-A5",
  nome_variacao: "Linho natural",
  estoque_inicial: "20",
}

/** Maximum rows per import file. */
export const MAX_IMPORT_ROWS = 1000

/** Maximum size of the import file. */
export const MAX_IMPORT_BYTES = 2 * 1024 * 1024

/** Error of one CSV line, shown in the report (#29). */
export type ImportLineError = {
  /** Line number in the file, counting the header as line 1. */
  line: number
  /** What is wrong, in Portuguese. */
  message: string
}

/** Import report. */
export type ImportReport = {
  created: number
  updated: number
  errors: ImportLineError[]
}
