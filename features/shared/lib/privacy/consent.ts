/**
 * Cookie consent (RF56, LGPD). Essential cookies (session, cart, CSRF
 * and this choice) need no consent; every other category only runs
 * after the visitor accepts it.
 */

/** Cookie that stores the choice of the visitor (essential). */
export const CONSENT_COOKIE = "ab_consent"

/** Version of the cookie notice; a new version asks again. */
export const CONSENT_VERSION = 1

/** How long the choice is kept: 180 days. */
export const CONSENT_MAX_AGE_SECONDS = 60 * 60 * 24 * 180

/** Browser event that reopens the cookie preferences. */
export const OPEN_CONSENT_EVENT = "ab:open-cookie-preferences"

/** Categories of non-essential cookies. */
export type ConsentCategory = "analytics" | "marketing"

/** Label and purpose of each category, in Portuguese. */
export const CONSENT_CATEGORIES: Record<
  ConsentCategory,
  { label: string; description: string }
> = {
  analytics: {
    label: "Medição de uso",
    description:
      "Estatísticas anônimas de navegação para melhorar a loja. Hoje a loja não usa ferramenta de medição; nada é ativado sem a sua permissão.",
  },
  marketing: {
    label: "Comunicação e marketing",
    description:
      "Personalização de ofertas e campanhas. Hoje a loja não usa cookies de marketing; nada é ativado sem a sua permissão.",
  },
}

/** Choice of the visitor. */
export type ConsentChoice = {
  /** Notice version the choice answers. */
  version: number
  /** Accepted categories. */
  analytics: boolean
  marketing: boolean
  /** When the choice was made, ISO string. */
  decidedAt: string
}

/**
 * Reads the consent cookie. A missing, malformed or outdated value
 * means no choice yet, so nothing non-essential runs.
 *
 * @param raw - Cookie value (URI encoded JSON).
 * @returns The choice, or null.
 */
export function parseConsent(
  raw: string | undefined | null
): ConsentChoice | null {
  if (!raw) return null
  try {
    const value = JSON.parse(decodeURIComponent(raw)) as Partial<ConsentChoice>
    if (
      value.version !== CONSENT_VERSION ||
      typeof value.analytics !== "boolean" ||
      typeof value.marketing !== "boolean" ||
      typeof value.decidedAt !== "string"
    ) {
      return null
    }
    return {
      version: value.version,
      analytics: value.analytics,
      marketing: value.marketing,
      decidedAt: value.decidedAt,
    }
  } catch {
    return null
  }
}

/**
 * Builds the consent cookie value.
 *
 * @param choice - Accepted categories.
 * @param now - Moment of the choice.
 * @returns The URI encoded JSON.
 */
export function serializeConsent(
  choice: Pick<ConsentChoice, "analytics" | "marketing">,
  now: Date = new Date()
): string {
  return encodeURIComponent(
    JSON.stringify({
      version: CONSENT_VERSION,
      analytics: choice.analytics,
      marketing: choice.marketing,
      decidedAt: now.toISOString(),
    } satisfies ConsentChoice)
  )
}

/**
 * Whether a non-essential category may run: only after an explicit
 * acceptance (RF56).
 *
 * @param choice - Choice of the visitor, or null when none yet.
 * @param category - Cookie category.
 * @returns True only when accepted.
 */
export function hasConsent(
  choice: ConsentChoice | null,
  category: ConsentCategory
): boolean {
  return choice?.[category] === true
}
