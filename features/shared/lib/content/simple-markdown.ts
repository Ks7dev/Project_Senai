/** A piece of inline text, bold or not. */
export type InlineSpan = {
  /** Text, never HTML. */
  text: string
  /** Shown in bold. */
  bold: boolean
}

/** A block of an institutional page. */
export type TextBlock =
  | { type: "heading"; level: 2 | 3; spans: InlineSpan[] }
  | { type: "paragraph"; spans: InlineSpan[] }
  | { type: "list"; ordered: boolean; items: InlineSpan[][] }
  | { type: "quote"; spans: InlineSpan[] }
  | { type: "table"; header: InlineSpan[][]; rows: InlineSpan[][][] }
  | { type: "rule" }

/**
 * Splits inline text into bold and regular spans ("**negrito**"). The
 * text is never interpreted as HTML, so the page cannot inject markup.
 *
 * @param text - One line of text.
 * @returns The spans.
 */
export function parseInline(text: string): InlineSpan[] {
  const spans: InlineSpan[] = []
  const parts = text.split("**")
  parts.forEach((part, index) => {
    if (part.length === 0) return
    // An unmatched trailing "**" is kept as text
    const bold = index % 2 === 1 && index < parts.length - 1
    spans.push({
      text: bold ? part : index % 2 === 1 ? `**${part}` : part,
      bold,
    })
  })
  return spans
}

/**
 * Splits a table row ("| a | b |") into its cells.
 *
 * @param line - Table line.
 * @returns The cell texts.
 */
function tableCells(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim())
}

/**
 * Parses the small Markdown subset of the institutional pages (RF57):
 * `##`/`###` headings, paragraphs, `-` and `1.` lists, `>` notes,
 * `|` tables, `---` rules and `**bold**`. Anything else is plain text.
 *
 * @param source - Page body.
 * @returns The blocks, in order.
 */
export function parseSimpleMarkdown(source: string): TextBlock[] {
  const lines = source.replace(/\r\n?/g, "\n").split("\n")
  const blocks: TextBlock[] = []
  let index = 0
  while (index < lines.length) {
    const line = lines[index].trim()
    if (line === "") {
      index += 1
      continue
    }
    if (/^-{3,}$/.test(line)) {
      blocks.push({ type: "rule" })
      index += 1
      continue
    }
    const heading = /^(#{1,3})\s+(.*)$/.exec(line)
    if (heading) {
      blocks.push({
        type: "heading",
        level: heading[1].length <= 2 ? 2 : 3,
        spans: parseInline(heading[2]),
      })
      index += 1
      continue
    }
    if (line.startsWith("|")) {
      const rows: string[][] = []
      while (index < lines.length && lines[index].trim().startsWith("|")) {
        const cells = tableCells(lines[index])
        if (!cells.every((cell) => /^:?-{3,}:?$/.test(cell))) rows.push(cells)
        index += 1
      }
      const [header = [], ...body] = rows
      blocks.push({
        type: "table",
        header: header.map(parseInline),
        rows: body.map((row) => row.map(parseInline)),
      })
      continue
    }
    const listPattern = /^(-|\*|\d+\.)\s+(.*)$/
    const listMatch = listPattern.exec(line)
    if (listMatch) {
      const ordered = /\d/.test(listMatch[1])
      const items: InlineSpan[][] = []
      while (index < lines.length) {
        const match = listPattern.exec(lines[index].trim())
        if (!match || /\d/.test(match[1]) !== ordered) break
        items.push(parseInline(match[2]))
        index += 1
      }
      blocks.push({ type: "list", ordered, items })
      continue
    }
    if (line.startsWith(">")) {
      const quoted: string[] = []
      while (index < lines.length && lines[index].trim().startsWith(">")) {
        quoted.push(lines[index].trim().replace(/^>\s?/, ""))
        index += 1
      }
      blocks.push({ type: "quote", spans: parseInline(quoted.join(" ")) })
      continue
    }
    const paragraph: string[] = []
    while (index < lines.length) {
      const next = lines[index].trim()
      if (
        next === "" ||
        /^(#{1,3}\s|\||>|-{3,}$)/.test(next) ||
        listPattern.test(next)
      ) {
        break
      }
      paragraph.push(next)
      index += 1
    }
    blocks.push({ type: "paragraph", spans: parseInline(paragraph.join(" ")) })
  }
  return blocks
}
