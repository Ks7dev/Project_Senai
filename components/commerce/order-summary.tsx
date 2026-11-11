const brl = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
})

/** Amounts of an order or cart, as decimal strings. */
export type OrderSummaryProps = {
  /** Sum of the items. */
  subtotal: string
  /** Additional services (packaging, assembly, engraving). */
  services?: string
  /** Shipping, or undefined while not calculated. */
  shipping?: string
  /** Discounts (positive number). */
  discount?: string
  /** Final total. */
  total: string
  /** Optional note below the total (e.g. installments, invoiced terms). */
  note?: string
}

/**
 * Order summary used by the cart drawer, cart, checkout and order
 * pages (#16). Shipping shows "a calcular" until it is known.
 *
 * @param props - Amounts.
 * @returns The summary.
 */
export function OrderSummary({
  subtotal,
  services,
  shipping,
  discount,
  total,
  note,
}: OrderSummaryProps) {
  const row = (label: string, value: string, muted = false) => (
    <div className="flex justify-between gap-md py-xs text-body-sm">
      <dt className={muted ? "text-ink-muted" : "text-ink"}>{label}</dt>
      <dd className="text-ink">{value}</dd>
    </div>
  )
  return (
    <section
      aria-label="Resumo do pedido"
      className="flex flex-col gap-sm rounded-lg bg-subtle p-md"
    >
      <h2 className="text-headline-sm">Resumo</h2>
      <dl className="flex flex-col">
        {row("Subtotal", brl.format(Number(subtotal)), true)}
        {services &&
          Number(services) > 0 &&
          row("Serviços adicionais", brl.format(Number(services)), true)}
        {row(
          "Frete",
          shipping === undefined
            ? "A calcular"
            : Number(shipping) === 0
              ? "Grátis"
              : brl.format(Number(shipping)),
          true
        )}
        {discount &&
          Number(discount) > 0 &&
          row("Descontos", `− ${brl.format(Number(discount))}`, true)}
        <div className="mt-xs flex justify-between gap-md border-t border-line-subtle pt-sm">
          <dt className="text-subhead text-ink">Total</dt>
          <dd className="text-headline-sm text-ink">
            {brl.format(Number(total))}
          </dd>
        </div>
      </dl>
      {note && <p className="text-body-sm text-ink-muted">{note}</p>}
    </section>
  )
}
