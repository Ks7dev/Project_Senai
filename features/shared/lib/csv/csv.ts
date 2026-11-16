/**
 * Parses CSV text (RFC 4180): quoted fields, escaped quotes ("") and
 * line breaks inside quotes. Detects ";" (Excel in Portuguese) or ","
 * as the delimiter from the header line. Ignores a UTF-8 BOM.
 *
 * @param text - CSV contents.
 * @returns Rows of fields, without fully empty lines.
 */
export function parseCsv(text: string): string[][] {
  const source = text.replace(/^﻿/, "")
  const firstLine = source.split(/\r?\n/, 1)[0] ?? ""
  const delimiter =
    (firstLine.match(/;/g)?.length ?? 0) >= (firstLine.match(/,/g)?.length ?? 0)
      ? ";"
      : ","

  const rows: string[][] = []
  let row: string[] = []
  let field = ""
  let quoted = false

  for (let i = 0; i < source.length; i++) {
    const char = source[i]
    if (quoted) {
      if (char === '"' && source[i + 1] === '"') {
        field += '"'
        i++
      } else if (char === '"') {
        quoted = false
      } else {
        field += char
      }
      continue
    }
    if (char === '"' && field === "") {
      quoted = true
    } else if (char === delimiter) {
      row.push(field)
      field = ""
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && source[i + 1] === "\n") i++
      row.push(field)
      rows.push(row)
      row = []
      field = ""
    } else {
      field += char
    }
  }
  row.push(field)
  rows.push(row)
  return rows.filter((r) => r.some((value) => value.trim() !== ""))
}

/**
 * Builds CSV text with ";" as the delimiter (opens correctly in Excel
 * in Portuguese), quoting fields when needed.
 *
 * @param rows - Rows of fields.
 * @returns CSV text with a UTF-8 BOM.
 */
export function toCsv(rows: string[][]): string {
  const escape = (value: string) =>
    /[;"\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value
  return `﻿${rows.map((row) => row.map(escape).join(";")).join("\r\n")}\r\n`
}
