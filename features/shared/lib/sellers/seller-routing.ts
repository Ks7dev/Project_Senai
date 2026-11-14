/** Customer segment of the seller rules (RN11). */
export type SellerSegment = "PF" | "PJ"

/** A rule that assigns a seller by region and segment (RN11). */
export type SellerRuleCandidate = {
  /** Rule id. */
  id: string
  /** Seller of the rule. */
  sellerId: string
  /** Segment; null means any. */
  personType: SellerSegment | null
  /** State (UF); null means any. */
  state: string | null
  /** Creation date, to break ties (oldest rule wins). */
  createdAt: Date
}

/** Brazilian states (UF), for the rule form and its validation. */
export const BRAZILIAN_STATES = [
  "AC",
  "AL",
  "AM",
  "AP",
  "BA",
  "CE",
  "DF",
  "ES",
  "GO",
  "MA",
  "MG",
  "MS",
  "MT",
  "PA",
  "PB",
  "PE",
  "PI",
  "PR",
  "RJ",
  "RN",
  "RO",
  "RR",
  "RS",
  "SC",
  "SE",
  "SP",
  "TO",
] as const

/** Label of each segment, in Portuguese. */
export const SELLER_SEGMENT_LABEL: Record<SellerSegment, string> = {
  PF: "Pessoa física",
  PJ: "Empresas (PJ)",
}

/**
 * How specific a rule is for the customer, or null when it does not
 * apply: region and segment (3) beat region only (2), which beats
 * segment only (1), which beats the general rule (0).
 *
 * @param rule - Candidate rule.
 * @param customer - Segment and state of the customer.
 * @returns The score, or null.
 */
export function sellerRuleScore(
  rule: Pick<SellerRuleCandidate, "personType" | "state">,
  customer: { personType: SellerSegment | null; state: string | null }
): number | null {
  if (rule.personType && rule.personType !== customer.personType) return null
  if (rule.state && rule.state !== customer.state) return null
  return (rule.state ? 2 : 0) + (rule.personType ? 1 : 0)
}

/**
 * Picks the seller rule of a customer (RN11): the most specific active
 * rule for their region and segment, the oldest one on a tie. Visitors
 * (no segment, no state) get the general rule.
 *
 * @param rules - Active rules.
 * @param customer - Segment and state of the customer.
 * @returns The rule, or null when none applies.
 */
export function pickSellerRule<T extends SellerRuleCandidate>(
  rules: readonly T[],
  customer: { personType: SellerSegment | null; state: string | null }
): T | null {
  let best: { rule: T; score: number } | null = null
  for (const rule of rules) {
    const score = sellerRuleScore(rule, customer)
    if (score === null) continue
    if (
      !best ||
      score > best.score ||
      (score === best.score &&
        rule.createdAt.getTime() < best.rule.createdAt.getTime())
    ) {
      best = { rule, score }
    }
  }
  return best?.rule ?? null
}

/**
 * WhatsApp link of a seller with a first message (RF18). Phones are
 * stored as digits; numbers with area code and no country code get the
 * Brazilian code 55. The message never carries personal data.
 *
 * @param phone - Seller phone.
 * @param message - First message.
 * @returns The wa.me link, or null when the phone is not valid.
 */
export function whatsappLink(
  phone: string | null | undefined,
  message: string
): string | null {
  const digits = (phone ?? "").replace(/\D/g, "")
  const international =
    digits.length === 10 || digits.length === 11 ? `55${digits}` : digits
  if (!/^55\d{10,11}$/.test(international)) return null
  return `https://wa.me/${international}?text=${encodeURIComponent(message)}`
}

/**
 * First WhatsApp message to the seller, about a product or the cart.
 *
 * @param input - Seller name and the product, or the cart.
 * @returns The message.
 */
export function sellerGreeting(input: {
  sellerName: string
  productName?: string | null
  fromCart?: boolean
}): string {
  const firstName = input.sellerName.split(" ")[0] ?? input.sellerName
  if (input.productName) {
    return `Olá, ${firstName}! Vim do site da Atelier Bureau e gostaria de falar sobre o produto “${input.productName}”.`
  }
  if (input.fromCart) {
    return `Olá, ${firstName}! Vim do site da Atelier Bureau e gostaria de ajuda com os itens do meu carrinho.`
  }
  return `Olá, ${firstName}! Vim do site da Atelier Bureau e gostaria de atendimento.`
}
