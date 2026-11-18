/**
 * Concrete Mercado Pago hosts used by the Payment Brick (RF28, RF35,
 * #174), per CSP directive. Taken from the hosts the SDK
 * (`https://sdk.mercadopago.com/js/v2`) references for Brazil:
 *
 * - `sdk.mercadopago.com`: the SDK itself and its payment request page.
 * - `http2.mlstatic.com`: Brick assets (scripts, styles, fonts, logos).
 * - `api.mercadopago.com`: Brick API (payment methods, card tokens,
 *   installments, identification types).
 * - `api.mercadolibre.com`: SDK telemetry (`/tracks`).
 * - `secure-fields.mercadopago.com` and `api-static.mercadopago.com`:
 *   iframes of the secure card fields.
 * - `www.mercadopago.com.br`: wallet (Mercado Pago account) checkout.
 * - `www.mercadolivre.com.br`: passkey (FIDO) authentication page.
 *
 * Wildcards (`*.mercadopago.com` and the like) are not allowed: a new
 * host only enters after the sandbox payment is tested with it.
 */
export const MERCADO_PAGO_CSP_HOSTS = {
  script: ["https://sdk.mercadopago.com", "https://http2.mlstatic.com"],
  style: ["https://http2.mlstatic.com"],
  img: ["https://http2.mlstatic.com"],
  font: ["https://http2.mlstatic.com"],
  connect: [
    "https://api.mercadopago.com",
    "https://api.mercadolibre.com",
    "https://http2.mlstatic.com",
  ],
  frame: [
    "https://sdk.mercadopago.com",
    "https://secure-fields.mercadopago.com",
    "https://api-static.mercadopago.com",
    "https://www.mercadopago.com.br",
    "https://www.mercadolivre.com.br",
  ],
} as const

/**
 * Concrete hosts of the Mercado Pago security script (#232), which
 * creates the buyer `device_id` sent in `X-meli-session-id`. Allowed
 * only on the payment page, the one page that loads the script. Taken
 * from `https://www.mercadopago.com/v2/security.js` and the profiling
 * script it receives (with the CSP nonce) from the device session API:
 *
 * - `www.mercadopago.com`: the security script itself.
 * - `api.mercadopago.com`: the device session API (`/v1/device_sessions`),
 *   already allowed for the Brick.
 * - `www.mercadolibre.com`: profiling pixels and the `etid` request.
 * - `www.mercadolivre.com` and `www.mercadopago.com.br`: profiling pixel
 *   of Brazil, chosen by the domain of the store.
 */
export const MERCADO_PAGO_DEVICE_CSP_HOSTS = {
  script: ["https://www.mercadopago.com"],
  img: [
    "https://www.mercadolibre.com",
    "https://www.mercadolivre.com",
    "https://www.mercadopago.com.br",
  ],
  connect: ["https://www.mercadolibre.com"],
} as const

/** Request header carrying the CSP nonce set by the proxy (#173). */
export const NONCE_HEADER = "x-nonce"

/** Route that only logs CSP violation reports (#173, PCI 11.6.1). */
export const CSP_REPORT_PATH = "/api/csp-report"

/** Reporting API group name used by `report-to` (#173). */
export const CSP_REPORT_GROUP = "csp-endpoint"

/** Payment page path: `/conta/pedidos/<id>/pagamento` (RF28, #173). */
const PAYMENT_PAGE_PATH = /^\/conta\/pedidos\/[^/]+\/pagamento\/?$/

/**
 * `source` of the next.config.ts header rule with the static CSP: every
 * path except the payment page, whose CSP (with nonce) comes from the
 * proxy. Two CSP headers on the same page would be enforced together.
 */
export const STATIC_CSP_SOURCE =
  "/:path((?!conta/pedidos/[^/]+/pagamento/?$).*)"

/**
 * Whether a path is the payment page, which gets the nonce based CSP
 * (#173, PCI 6.4.3).
 *
 * @param pathname - Request path.
 * @returns `true` for the payment page.
 */
export function isPaymentPagePath(pathname: string): boolean {
  return PAYMENT_PAGE_PATH.test(pathname)
}

/**
 * Creates a random nonce for the CSP of one request (128 bits, base64).
 *
 * @returns The nonce.
 */
export function createNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  return btoa(String.fromCharCode(...bytes))
}

/**
 * Joins the directives into a CSP header value.
 *
 * @param directives - Directive name and sources.
 * @param isDev - Development mode skips `upgrade-insecure-requests`.
 * @returns The header value.
 */
function serialize(
  directives: Record<string, readonly string[]>,
  isDev: boolean
): string {
  const policy = Object.entries(directives)
    .map(([name, values]) => `${name} ${values.join(" ")}`)
    .join("; ")
  return isDev ? policy : `${policy}; upgrade-insecure-requests`
}

/**
 * Directives shared by every page, with `script-src` left to the
 * caller.
 *
 * @param scriptSrc - Sources of `script-src`.
 * @returns The directives.
 */
function baseDirectives(
  scriptSrc: string[]
): Record<string, readonly string[]> {
  return {
    "default-src": ["'self'"],
    "script-src": scriptSrc,
    "style-src": ["'self'", "'unsafe-inline'", ...MERCADO_PAGO_CSP_HOSTS.style],
    "img-src": ["'self'", "data:", "blob:", ...MERCADO_PAGO_CSP_HOSTS.img],
    "font-src": ["'self'", "data:", ...MERCADO_PAGO_CSP_HOSTS.font],
    "connect-src": ["'self'", ...MERCADO_PAGO_CSP_HOSTS.connect],
    "frame-src": ["'self'", ...MERCADO_PAGO_CSP_HOSTS.frame],
    "object-src": ["'none'"],
    "base-uri": ["'self'"],
    "form-action": ["'self'"],
    "frame-ancestors": ["'none'"],
  }
}

/**
 * Builds the Content-Security-Policy header of the statically rendered
 * pages (RNF06, #11). Inline scripts stay allowed there because Next.js
 * injects them at build time; the payment page uses
 * {@link buildPaymentContentSecurityPolicy} instead (#173).
 *
 * @param isDev - Development mode allows `eval` for hot reload.
 * @returns The CSP header value.
 */
export function buildContentSecurityPolicy(isDev: boolean): string {
  return serialize(
    baseDirectives([
      "'self'",
      "'unsafe-inline'",
      ...(isDev ? ["'unsafe-eval'"] : []),
      ...MERCADO_PAGO_CSP_HOSTS.script,
    ]),
    isDev
  )
}

/**
 * Builds the Content-Security-Policy of the payment page (#173, PCI
 * 6.4.3 and 11.6.1): `script-src` without `'unsafe-inline'`, allowing
 * inline scripts only with the per request nonce, and violations
 * reported to {@link CSP_REPORT_PATH}. It also allows the Mercado Pago
 * security script that creates the `device_id` (#232).
 *
 * @param isDev - Development mode allows `eval` for hot reload.
 * @param nonce - Nonce of the request.
 * @returns The CSP header value.
 */
export function buildPaymentContentSecurityPolicy(
  isDev: boolean,
  nonce: string
): string {
  const directives = baseDirectives([
    "'self'",
    `'nonce-${nonce}'`,
    ...(isDev ? ["'unsafe-eval'"] : []),
    ...MERCADO_PAGO_CSP_HOSTS.script,
    ...MERCADO_PAGO_DEVICE_CSP_HOSTS.script,
  ])
  directives["img-src"] = [
    ...directives["img-src"],
    ...MERCADO_PAGO_DEVICE_CSP_HOSTS.img,
  ]
  directives["connect-src"] = [
    ...directives["connect-src"],
    ...MERCADO_PAGO_DEVICE_CSP_HOSTS.connect,
  ]
  const policy = serialize(directives, isDev)
  return `${policy}; report-uri ${CSP_REPORT_PATH}; report-to ${CSP_REPORT_GROUP}`
}

/**
 * `Reporting-Endpoints` header that names the `report-to` group of the
 * payment page CSP (#173).
 *
 * @returns The header value.
 */
export function reportingEndpoints(): string {
  return `${CSP_REPORT_GROUP}="${CSP_REPORT_PATH}"`
}

/**
 * Security headers sent by the app itself on every route, in addition
 * to the ones the Caddy proxy adds (HSTS is set only by the proxy, over
 * HTTPS). The CSP is separate: see {@link buildContentSecurityPolicy}.
 *
 * @returns Header name and value pairs.
 */
export function securityHeaders(): Array<{ key: string; value: string }> {
  return [
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "X-Frame-Options", value: "DENY" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    {
      key: "Permissions-Policy",
      value: "camera=(), microphone=(), geolocation=(), payment=(self)",
    },
  ]
}
