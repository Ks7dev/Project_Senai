/**
 * Shipping methods the sales team may quote by hand (everything but
 * the manual quote itself): for an order waiting for the shipping
 * quote (#44) and for a quote converted into an order (#50).
 */
export const QUOTED_METHODS = {
  CORREIOS_PAC: "Correios PAC",
  CORREIOS_SEDEX: "Correios SEDEX",
  CARRIER: "Transportadora",
  OWN_DELIVERY: "Entrega própria com montagem",
} as const

/** A quoted shipping method key. */
export type QuotedMethod = keyof typeof QUOTED_METHODS

/** Every quoted shipping method key, for validation. */
export const QUOTED_METHOD_KEYS = Object.keys(QUOTED_METHODS) as [
  QuotedMethod,
  ...QuotedMethod[],
]
