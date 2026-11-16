import type { ReactElement } from "react"
import axe from "axe-core"
import { renderToStaticMarkup } from "react-dom/server"

/** WCAG 2.1 A and AA rule sets checked by axe (RNF13). */
const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]

/** One axe violation, reduced to what a failing test should print. */
export type A11yViolation = {
  id: string
  impact: string | null | undefined
  help: string
  targets: string[]
}

/**
 * Renders a component to static HTML inside the jsdom document, with
 * the store language and a title, so page-level rules apply.
 *
 * @param element - Element to render.
 * @returns The container holding the markup.
 */
export function renderToDocument(element: ReactElement): HTMLElement {
  document.documentElement.lang = "pt-BR"
  document.title = "Atelier Bureau"
  document.body.innerHTML = `<div id="root">${renderToStaticMarkup(element)}</div>`
  return document.getElementById("root") as HTMLElement
}

/**
 * Runs axe-core with the WCAG 2.1 AA rules on the rendered markup.
 * `color-contrast` is off because jsdom does not compute styles; the
 * token contrast ratios are checked in tests/design/tokens.test.ts.
 *
 * @param element - Element to render and audit.
 * @returns The violations found (empty when the markup passes).
 */
export async function auditA11y(
  element: ReactElement
): Promise<A11yViolation[]> {
  const container = renderToDocument(element)
  const result = await axe.run(container, {
    runOnly: { type: "tag", values: WCAG_TAGS },
    rules: { "color-contrast": { enabled: false } },
  })
  return result.violations.map((violation) => ({
    id: violation.id,
    impact: violation.impact,
    help: violation.help,
    targets: violation.nodes.map((node) => node.target.join(" ")),
  }))
}
