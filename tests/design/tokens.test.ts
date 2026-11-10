import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

const css = readFileSync(join(process.cwd(), "app/tokens.css"), "utf8")

/**
 * Reads a hex color token from app/tokens.css.
 *
 * @param name - Token name without the leading dashes.
 * @returns The hex value.
 */
function token(name: string): string {
  const match = css.match(new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`))
  if (!match) throw new Error(`Token --${name} not found`)
  return match[1]
}

/**
 * Relative luminance as defined by WCAG 2.1.
 *
 * @param hex - Color in #rrggbb format.
 * @returns Luminance between 0 and 1.
 */
function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/**
 * WCAG contrast ratio between two colors.
 *
 * @param a - First color.
 * @param b - Second color.
 * @returns Ratio from 1 to 21.
 */
function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

const surfaces = [
  "ab-surface-canvas",
  "ab-surface-subtle",
  "ab-surface-elevated",
]

// Text colors allowed on regular surfaces. Disabled text is exempt
// from WCAG contrast and intentionally left out.
const textOnSurfaces = [
  "ab-text-primary",
  "ab-text-secondary",
  "ab-primary",
  "ab-primary-hover",
  "ab-secondary",
  "ab-error",
  "ab-success",
  "ab-warning",
]

const pairs: Array<[string, string]> = [
  ...textOnSurfaces.flatMap((text) =>
    surfaces.map((bg): [string, string] => [text, bg])
  ),
  ["ab-on-primary", "ab-primary"],
  ["ab-on-primary", "ab-primary-hover"],
  ["ab-on-secondary", "ab-secondary"],
  ["ab-on-error", "ab-error"],
  ["ab-text-primary", "ab-primary-tint"],
  ["ab-primary", "ab-primary-tint"],
  ["ab-text-primary", "ab-secondary-tint"],
  ["ab-secondary", "ab-secondary-tint"],
  ["ab-text-primary", "ab-error-tint"],
  ["ab-error", "ab-error-tint"],
]

describe("design tokens contrast (RNF13)", () => {
  it.each(pairs)("%s on %s is at least 4.5:1", (text, bg) => {
    expect(contrast(token(text), token(bg))).toBeGreaterThanOrEqual(4.5)
  })

  it("does not reference removed fonts", () => {
    expect(css).not.toMatch(/Space Grotesk|Newsreader/i)
  })
})
