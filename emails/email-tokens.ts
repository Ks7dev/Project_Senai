/**
 * Colors and fonts of the "Warm Editorial Atelier" design system
 * (RNF15) for e-mails. E-mail clients do not read CSS variables, so the
 * hex values are repeated here; tests/emails/email-templates.test.ts
 * checks that they match app/tokens.css.
 */
export const EMAIL_TOKENS = {
  /** --ab-surface-canvas */
  canvas: "#fbf9f5",
  /** --ab-surface-subtle */
  subtle: "#f4f1ea",
  /** --ab-surface-elevated */
  elevated: "#ffffff",
  /** --ab-primary */
  primary: "#4a6353",
  /** --ab-on-primary */
  onPrimary: "#fbf9f5",
  /** --ab-secondary (terracotta) */
  clay: "#7a5c4c",
  /** --ab-text-primary */
  ink: "#1e2221",
  /** --ab-text-secondary */
  inkMuted: "#4e5451",
  /** Serif for headings (Playfair Display falls back to Georgia). */
  serif: "Georgia, 'Times New Roman', serif",
  /** Sans for text (Plus Jakarta Sans falls back to system fonts). */
  sans: "'Segoe UI', Helvetica, Arial, sans-serif",
} as const

/** Token names of app/tokens.css mirrored above. */
export const EMAIL_TOKEN_SOURCES: Record<
  Exclude<keyof typeof EMAIL_TOKENS, "serif" | "sans">,
  string
> = {
  canvas: "--ab-surface-canvas",
  subtle: "--ab-surface-subtle",
  elevated: "--ab-surface-elevated",
  primary: "--ab-primary",
  onPrimary: "--ab-on-primary",
  clay: "--ab-secondary",
  ink: "--ab-text-primary",
  inkMuted: "--ab-text-secondary",
}
