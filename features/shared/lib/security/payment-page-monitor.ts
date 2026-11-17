/** Placeholder that replaces the per request nonce in the baseline. */
export const NONCE_PLACEHOLDER = "{nonce}"

/** Script approved for the payment page (PCI 6.4.3, #173). */
export type ApprovedScript = {
  /** URL, or URL prefix when `match` is `prefix`. */
  src: string
  /** How `src` is compared. */
  match: "exact" | "prefix"
  /** Why the script is needed. */
  justification: string
}

/** Versioned baseline of the payment page (`deploy/payment-page-baseline.json`). */
export type PaymentPageBaseline = {
  /** Path checked, e.g. `/conta/pedidos/{id}/pagamento`. */
  path: string
  /** Production CSP with the nonce replaced by {@link NONCE_PLACEHOLDER}. */
  contentSecurityPolicy: string
  /** Approved scripts. */
  scripts: ApprovedScript[]
}

/** Script tag found in the HTML of the payment page. */
export type FoundScript = { src: string | null; nonce: string | null }

/**
 * Parses a CSP header into directive name and sorted sources.
 *
 * @param value - CSP header value.
 * @returns Directive map.
 */
export function parseCsp(value: string): Map<string, string[]> {
  const directives = new Map<string, string[]>()
  for (const part of value.split(";")) {
    const [name, ...sources] = part.trim().split(/\s+/)
    if (!name) continue
    directives.set(name.toLowerCase(), [...sources].sort())
  }
  return directives
}

/**
 * Replaces the nonce of a CSP by {@link NONCE_PLACEHOLDER}.
 *
 * @param value - CSP header value.
 * @returns The CSP without the per request value.
 */
export function maskNonce(value: string): string {
  return value.replace(/'nonce-[^']+'/g, `'nonce-${NONCE_PLACEHOLDER}'`)
}

/**
 * Extracts the nonce of a CSP header.
 *
 * @param value - CSP header value.
 * @returns The nonce, or `null` when there is none.
 */
export function extractNonce(value: string): string | null {
  return value.match(/'nonce-([^']+)'/)?.[1] ?? null
}

/**
 * Compares a CSP with the approved one, ignoring the nonce value and
 * the order of the sources (PCI 11.6.1).
 *
 * @param expected - Approved CSP (baseline).
 * @param actual - CSP received.
 * @returns Divergences in Portuguese, empty when they match.
 */
export function diffCsp(expected: string, actual: string): string[] {
  const want = parseCsp(maskNonce(expected))
  const got = parseCsp(maskNonce(actual))
  const problems: string[] = []
  for (const [name, sources] of want) {
    const found = got.get(name)
    if (!found) {
      problems.push(`diretiva ${name} ausente`)
      continue
    }
    for (const source of sources) {
      if (!found.includes(source)) {
        problems.push(`${name}: origem ${source} removida`)
      }
    }
    for (const source of found) {
      if (!sources.includes(source)) {
        problems.push(`${name}: origem ${source} não aprovada`)
      }
    }
  }
  for (const name of got.keys()) {
    if (!want.has(name)) problems.push(`diretiva ${name} não aprovada`)
  }
  return problems
}

/**
 * Reads an attribute of a tag.
 *
 * @param attributes - Attribute text of the tag.
 * @param name - Attribute name.
 * @returns The value, or `null`.
 */
function attribute(attributes: string, name: string): string | null {
  const match = attributes.match(
    new RegExp(
      `(?:^|\\s)${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`,
      "i"
    )
  )
  if (!match) return null
  return match[1] ?? match[2] ?? match[3]
}

/** Script types the browser executes; any other type is inert data. */
const EXECUTABLE_TYPES = [
  "",
  "module",
  "text/javascript",
  "application/javascript",
]

/**
 * Lists the executable `<script>` tags of an HTML document; data blocks
 * such as `application/ld+json` are skipped.
 *
 * @param html - Page HTML.
 * @returns Source and nonce of each script.
 */
export function extractScripts(html: string): FoundScript[] {
  const scripts: FoundScript[] = []
  for (const match of html.matchAll(/<script\b([^>]*)>/gi)) {
    const attributes = match[1]
    const type = (attribute(attributes, "type") ?? "").trim().toLowerCase()
    if (!EXECUTABLE_TYPES.includes(type)) continue
    scripts.push({
      src: attribute(attributes, "src"),
      nonce: attribute(attributes, "nonce"),
    })
  }
  return scripts
}

/**
 * Whether a script source is in the approved inventory.
 *
 * @param src - Script `src`.
 * @param approved - Approved scripts.
 * @returns `true` when approved.
 */
function isApproved(src: string, approved: ApprovedScript[]): boolean {
  return approved.some((script) =>
    script.match === "exact" ? src === script.src : src.startsWith(script.src)
  )
}

/**
 * Checks the scripts of the payment page against the inventory: every
 * external script must be approved, and every script must carry the
 * nonce of the response CSP (PCI 6.4.3, 11.6.1).
 *
 * @param scripts - Scripts found in the HTML.
 * @param approved - Approved scripts.
 * @param nonce - Nonce of the response CSP.
 * @returns Divergences in Portuguese, empty when everything matches.
 */
export function checkScripts(
  scripts: FoundScript[],
  approved: ApprovedScript[],
  nonce: string | null
): string[] {
  const problems: string[] = []
  scripts.forEach((script, index) => {
    const label = script.src ?? `script inline nº ${index + 1}`
    if (script.src !== null && !isApproved(script.src, approved)) {
      problems.push(`script fora do inventário: ${script.src}`)
    }
    if (!nonce || script.nonce !== nonce) {
      problems.push(`${label} sem o nonce da CSP`)
    }
  })
  return problems
}

/**
 * Checks the CSP and, when the HTML is available, the scripts of the
 * payment page against the versioned baseline (#173, PCI 11.6.1).
 *
 * @param baseline - Approved baseline.
 * @param csp - CSP header received, or `null` when missing.
 * @param html - Page HTML, or `null` when the page was not rendered
 *   (e.g. redirect to the login).
 * @returns Divergences in Portuguese, empty when everything matches.
 */
export function checkPaymentPage(
  baseline: PaymentPageBaseline,
  csp: string | null,
  html: string | null
): string[] {
  if (!csp) return ["cabeçalho Content-Security-Policy ausente"]
  const problems = diffCsp(baseline.contentSecurityPolicy, csp)
  const scriptSrc = parseCsp(csp).get("script-src") ?? []
  if (scriptSrc.includes("'unsafe-inline'")) {
    problems.push("script-src com 'unsafe-inline'")
  }
  const nonce = extractNonce(csp)
  if (!nonce) problems.push("script-src sem nonce")
  if (html !== null) {
    problems.push(
      ...checkScripts(extractScripts(html), baseline.scripts, nonce)
    )
  }
  return problems
}
