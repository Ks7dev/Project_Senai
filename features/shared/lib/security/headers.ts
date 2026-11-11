/** Mercado Pago domains used by the Payment Brick (RF28, RF35). */
const MERCADO_PAGO = [
  "https://*.mercadopago.com",
  "https://*.mercadopago.com.br",
  "https://*.mercadolibre.com",
  "https://*.mercadolivre.com",
  "https://*.mlstatic.com",
]

/**
 * Builds the Content-Security-Policy header (RNF06, #11). Inline
 * scripts stay allowed because Next.js injects them and pages are
 * statically rendered; external scripts are limited to Mercado Pago.
 *
 * @param isDev - Development mode allows `eval` for hot reload.
 * @returns The CSP header value.
 */
export function buildContentSecurityPolicy(isDev: boolean): string {
  const directives: Record<string, string[]> = {
    "default-src": ["'self'"],
    "script-src": [
      "'self'",
      "'unsafe-inline'",
      ...(isDev ? ["'unsafe-eval'"] : []),
      "https://sdk.mercadopago.com",
      ...MERCADO_PAGO,
    ],
    "style-src": ["'self'", "'unsafe-inline'"],
    "img-src": ["'self'", "data:", "blob:", ...MERCADO_PAGO],
    "font-src": ["'self'", "data:"],
    "connect-src": ["'self'", ...MERCADO_PAGO],
    "frame-src": ["'self'", ...MERCADO_PAGO],
    "object-src": ["'none'"],
    "base-uri": ["'self'"],
    "form-action": ["'self'"],
    "frame-ancestors": ["'none'"],
  }
  const policy = Object.entries(directives)
    .map(([name, values]) => `${name} ${values.join(" ")}`)
    .join("; ")
  return isDev ? policy : `${policy}; upgrade-insecure-requests`
}

/**
 * Security headers sent by the app itself, in addition to the ones the
 * Caddy proxy adds (HSTS is set only by the proxy, over HTTPS).
 *
 * @param isDev - Whether the app runs in development mode.
 * @returns Header name and value pairs.
 */
export function securityHeaders(
  isDev: boolean
): Array<{ key: string; value: string }> {
  return [
    {
      key: "Content-Security-Policy",
      value: buildContentSecurityPolicy(isDev),
    },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "X-Frame-Options", value: "DENY" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    {
      key: "Permissions-Policy",
      value: "camera=(), microphone=(), geolocation=(), payment=(self)",
    },
  ]
}
