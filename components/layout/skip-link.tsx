/** Id of the main content region targeted by the skip link. */
export const MAIN_CONTENT_ID = "conteudo"

/**
 * "Skip to content" link (WCAG 2.4.1, RNF13): the first focusable
 * element of the page, hidden until it receives keyboard focus, that
 * jumps over the header and menus straight to the main content.
 *
 * @returns The skip link.
 */
export function SkipLink() {
  return (
    <a
      href={`#${MAIN_CONTENT_ID}`}
      className="sr-only z-50 rounded bg-primary px-md py-sm text-primary-foreground focus:not-sr-only focus:fixed focus:top-sm focus:left-sm"
    >
      Pular para o conteúdo
    </a>
  )
}
