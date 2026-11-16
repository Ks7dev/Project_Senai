import { cn } from "@/lib/utils"

/** Approximate colors of the materials and finishes of the catalog. */
const SWATCH_COLORS: Record<string, string> = {
  nogueira: "#5b3a29",
  carvalho: "#b08a5b",
  freijó: "#8a6a45",
  latão: "#b5a36a",
  "latão escovado": "#b5a36a",
  caramelo: "#a0612f",
  grafite: "#3c3f41",
  preto: "#1e2221",
  natural: "#e7dcc8",
  "linho natural": "#d9cdb4",
}

/**
 * Color of a material name, or a neutral tone when unknown.
 *
 * @param name - Material or finish name.
 * @returns A CSS color.
 */
export function swatchColor(name: string): string {
  return SWATCH_COLORS[name.trim().toLowerCase()] ?? "#cfc8bb"
}

/** One selectable option. */
export type SwatchOption = {
  /** Value sent on change (e.g. SKU code). */
  value: string
  /** Visible name of the material or finish. */
  label: string
}

type MaterialSwatchesProps = {
  /** Group name for the radio inputs. */
  name: string
  /** Visible legend. */
  legend: string
  /** Options. */
  options: SwatchOption[]
  /** Selected value. */
  value: string | undefined
  /** Called with the new value. */
  onChange: (value: string) => void
}

/**
 * Circular material and finish swatches (#16): native radio inputs, so
 * they work with the keyboard (arrow keys) and screen readers; the name
 * is always visible next to the color.
 *
 * @param props - Options, value and change handler.
 * @returns The swatch group.
 */
export function MaterialSwatches({
  name,
  legend,
  options,
  value,
  onChange,
}: MaterialSwatchesProps) {
  return (
    <fieldset className="flex flex-col gap-sm">
      <legend className="pb-xs text-label font-medium">
        {legend}
        {value && (
          <span className="font-normal text-ink-muted">
            : {options.find((o) => o.value === value)?.label}
          </span>
        )}
      </legend>
      <div className="flex flex-wrap gap-sm">
        {options.map((option) => (
          <label
            key={option.value}
            className="group flex cursor-pointer flex-col items-center gap-xs"
          >
            <input
              type="radio"
              name={name}
              value={option.value}
              checked={option.value === value}
              onChange={() => onChange(option.value)}
              className="peer sr-only"
            />
            <span
              aria-hidden
              style={{ backgroundColor: swatchColor(option.label) }}
              className={cn(
                "size-7 rounded-full border border-line ring-offset-2 ring-offset-canvas peer-focus-visible:ring-2 peer-focus-visible:ring-primary",
                option.value === value && "ring-2 ring-primary"
              )}
            />
            <span className="text-label-sm text-ink">{option.label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  )
}
