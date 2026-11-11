import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import {
  IMPORT_COLUMNS,
  TEMPLATE_EXAMPLE,
} from "@/features/catalog/products-admin/schema/import-schema"
import { parseImportRows } from "@/features/catalog/products-admin/schema/parse-import"
import { parseCatalogFilters } from "@/features/shared/lib/catalog/catalog-filters"
import { buildProductWhere } from "@/features/shared/lib/catalog/catalog-query"
import { parseCsv, toCsv } from "@/features/shared/lib/csv/csv"

describe("CSV parsing", () => {
  it("reads ';' files from Excel with quotes, BOM and CRLF", () => {
    const rows = parseCsv(
      '﻿nome;descricao\r\n"Caderno; A5";"Papel ""pólen"""\r\n\r\n'
    )
    expect(rows).toEqual([
      ["nome", "descricao"],
      ["Caderno; A5", 'Papel "pólen"'],
    ])
  })

  it("reads ',' files and line breaks inside quotes", () => {
    expect(parseCsv('a,b\n"linha 1\nlinha 2",x\n')).toEqual([
      ["a", "b"],
      ["linha 1\nlinha 2", "x"],
    ])
  })

  it("round-trips the template", () => {
    const csv = toCsv([
      [...IMPORT_COLUMNS],
      IMPORT_COLUMNS.map((c) => TEMPLATE_EXAMPLE[c]),
    ])
    const rows = parseCsv(csv)
    expect(rows[0]).toEqual([...IMPORT_COLUMNS])
    expect(rows[1][IMPORT_COLUMNS.indexOf("descricao")]).toBe(
      TEMPLATE_EXAMPLE.descricao
    )
  })
})

describe("product import validation (#29)", () => {
  const header = [...IMPORT_COLUMNS]
  const example = IMPORT_COLUMNS.map((c) => TEMPLATE_EXAMPLE[c])
  const withValue = (column: string, value: string) =>
    example.map((v, i) => (IMPORT_COLUMNS[i] === column ? value : v))

  it("validates every line independently and keeps line numbers", () => {
    const result = parseImportRows([
      header,
      example,
      withValue("peso_kg", ""),
      withValue("preco", "abc"),
    ])
    if ("error" in result) throw new Error(result.error)
    expect(result.lines.map((l) => [l.line, l.ok])).toEqual([
      [2, true],
      [3, false],
      [4, false],
    ])
    const third = result.lines[1]
    expect(!third.ok && third.message).toMatch(/^peso_kg:/)
    const fourth = result.lines[2]
    expect(!fourth.ok && fourth.message).toMatch(/^preco:/)
  })

  it("normalizes Brazilian numbers like the product form", () => {
    const result = parseImportRows([header, example])
    if ("error" in result) throw new Error(result.error)
    const line = result.lines[0]
    expect(line.ok && line.data.basePrice).toBe("249.00")
    expect(line.ok && line.data.skus[0].code).toBe("PAP-CAD-LIN-A5")
  })

  it("rejects files without the template columns", () => {
    expect(
      parseImportRows([
        ["nome", "preco"],
        ["X", "1"],
      ])
    ).toHaveProperty("error")
  })
})

describe("product inactivation keeps history (#28, RF42)", () => {
  it("hides inactive and draft products from the listing and search", () => {
    const where = JSON.stringify(
      buildProductWhere(parseCatalogFilters({ q: "caderno" }))
    )
    expect(where).toContain('"status":"ACTIVE"')
  })

  it("keeps a name and SKU snapshot in every order item", () => {
    const schema = readFileSync(
      join(process.cwd(), "prisma/schema.prisma"),
      "utf8"
    )
    const orderItem = schema.slice(schema.indexOf("model OrderItem"))
    expect(orderItem).toMatch(/productName\s+String/)
    expect(orderItem).toMatch(/skuCode\s+String/)
    expect(orderItem).toMatch(/onDelete: Restrict/)
  })
})
