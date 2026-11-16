import { Fragment } from "react"
import {
  parseSimpleMarkdown,
  type InlineSpan,
} from "@/features/shared/lib/content/simple-markdown"

/**
 * Renders inline spans as text, never as HTML.
 *
 * @param props - Spans.
 * @returns The text.
 */
function Spans({ spans }: { spans: InlineSpan[] }) {
  return (
    <>
      {spans.map((span, index) =>
        span.bold ? (
          <strong key={index} className="font-semibold text-ink">
            {span.text}
          </strong>
        ) : (
          <Fragment key={index}>{span.text}</Fragment>
        )
      )}
    </>
  )
}

/**
 * Renders the text of an institutional page (RF57) from the small
 * Markdown subset, with the design system typography. React escapes
 * every text, so no markup typed in the back office reaches the page.
 *
 * @param props - Page body.
 * @returns The formatted text.
 */
export function RichText({ source }: { source: string }) {
  const blocks = parseSimpleMarkdown(source)
  return (
    <div className="flex flex-col gap-md text-body text-ink">
      {blocks.map((block, index) => {
        switch (block.type) {
          case "heading":
            return block.level === 2 ? (
              <h2 key={index} className="mt-md text-headline-md">
                <Spans spans={block.spans} />
              </h2>
            ) : (
              <h3 key={index} className="mt-sm text-headline-sm">
                <Spans spans={block.spans} />
              </h3>
            )
          case "paragraph":
            return (
              <p key={index}>
                <Spans spans={block.spans} />
              </p>
            )
          case "quote":
            return (
              <p
                key={index}
                className="rounded border-l-4 border-primary bg-subtle p-sm text-body-sm"
              >
                <Spans spans={block.spans} />
              </p>
            )
          case "list": {
            const List = block.ordered ? "ol" : "ul"
            return (
              <List
                key={index}
                className={`flex flex-col gap-xs pl-lg ${block.ordered ? "list-decimal" : "list-disc"}`}
              >
                {block.items.map((item, itemIndex) => (
                  <li key={itemIndex}>
                    <Spans spans={item} />
                  </li>
                ))}
              </List>
            )
          }
          case "table":
            return (
              <div key={index} className="overflow-x-auto">
                <table className="w-full border-collapse text-left text-body-sm">
                  <thead>
                    <tr>
                      {block.header.map((cell, cellIndex) => (
                        <th
                          key={cellIndex}
                          scope="col"
                          className="border-b border-line p-sm font-semibold"
                        >
                          <Spans spans={cell} />
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {block.rows.map((row, rowIndex) => (
                      <tr key={rowIndex}>
                        {row.map((cell, cellIndex) => (
                          <td
                            key={cellIndex}
                            className="border-b border-line-subtle p-sm align-top"
                          >
                            <Spans spans={cell} />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          case "rule":
            return <hr key={index} className="border-line-subtle" />
        }
      })}
    </div>
  )
}
