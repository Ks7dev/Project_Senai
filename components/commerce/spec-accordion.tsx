import { ChevronDownIcon } from "lucide-react"

/** A section of the accordion. */
export type SpecSection = {
  /** Section title. */
  title: string
  /** Label/value rows. */
  rows?: Array<{ label: string; value: string }>
  /** Free content instead of rows. */
  content?: React.ReactNode
  /** Open on first render. */
  defaultOpen?: boolean
}

/**
 * Specifications accordion (#16) built on native details/summary, so
 * it opens with Enter or Space and needs no JavaScript.
 *
 * @param props - Sections.
 * @returns The accordion.
 */
export function SpecAccordion({ sections }: { sections: SpecSection[] }) {
  return (
    <div className="divide-y divide-line-subtle border-y border-line-subtle">
      {sections.map((section) => (
        <details
          key={section.title}
          open={section.defaultOpen}
          className="group"
        >
          <summary className="flex cursor-pointer list-none items-center justify-between gap-md py-md text-subhead text-ink [&::-webkit-details-marker]:hidden">
            {section.title}
            <ChevronDownIcon
              aria-hidden
              className="size-4 transition-transform group-open:rotate-180"
            />
          </summary>
          <div className="pb-md">
            {section.rows ? (
              <dl className="flex flex-col">
                {section.rows.map((row) => (
                  <div
                    key={row.label}
                    className="grid grid-cols-2 gap-md py-xs text-body-sm"
                  >
                    <dt className="text-ink-muted">{row.label}</dt>
                    <dd className="text-ink">{row.value}</dd>
                  </div>
                ))}
              </dl>
            ) : (
              section.content
            )}
          </div>
        </details>
      ))}
    </div>
  )
}
