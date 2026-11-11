import Link from "next/link"
import {
  CalendarDaysIcon,
  CircleCheckIcon,
  CircleDotIcon,
  CircleIcon,
  CircleXIcon,
  ExternalLinkIcon,
  PackageIcon,
} from "lucide-react"
import type { OrderTracking } from "@/features/orders/order-tracking/action/order-tracking-actions"
import type {
  TimelineStep,
  TimelineStepState,
} from "@/features/shared/lib/orders/order-timeline"
import { cn } from "@/lib/utils"

const brl = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
})

const dateTime = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "America/Sao_Paulo",
})

const longDate = new Intl.DateTimeFormat("pt-BR", {
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "America/Sao_Paulo",
})

/** Screen reader text of each step state. */
const STATE_LABEL: Record<TimelineStepState, string> = {
  done: "Concluído",
  current: "Etapa atual",
  pending: "Próxima etapa",
  problem: "Encerrado",
}

/**
 * Icon of a timeline step.
 *
 * @param props - Step state.
 * @returns The icon.
 */
function StepIcon({ state }: { state: TimelineStepState }) {
  const className = "size-6 shrink-0"
  if (state === "done") {
    return (
      <CircleCheckIcon className={cn(className, "text-primary")} aria-hidden />
    )
  }
  if (state === "current") {
    return <CircleDotIcon className={cn(className, "text-clay")} aria-hidden />
  }
  if (state === "problem") {
    return <CircleXIcon className={cn(className, "text-error")} aria-hidden />
  }
  return <CircleIcon className={cn(className, "text-ink-muted")} aria-hidden />
}

/**
 * Order timeline: every status of the order path, with the date each
 * one was reached (RF15).
 *
 * @param props - Timeline steps.
 * @returns The ordered list.
 */
function Timeline({ steps }: { steps: TimelineStep[] }) {
  return (
    <ol className="flex flex-col">
      {steps.map((step, index) => (
        <li
          key={step.status}
          aria-current={step.state === "current" ? "step" : undefined}
          className="relative flex gap-sm pb-md last:pb-0"
        >
          {index < steps.length - 1 && (
            <span
              aria-hidden
              className={cn(
                "absolute top-7 bottom-0 left-[11px] w-0.5",
                step.state === "done" ? "bg-primary" : "bg-line-subtle"
              )}
            />
          )}
          <StepIcon state={step.state} />
          <div className="flex flex-col">
            <span
              className={cn(
                "text-body",
                step.state === "pending" ? "text-ink-muted" : "text-ink",
                step.state === "current" && "font-semibold"
              )}
            >
              {step.label}
              <span className="sr-only"> — {STATE_LABEL[step.state]}</span>
            </span>
            <span className="text-body-sm text-ink-muted">
              {step.description}
            </span>
            {step.at && (
              <time dateTime={step.at} className="text-label-sm text-ink-muted">
                {dateTime.format(new Date(step.at))}
              </time>
            )}
          </div>
        </li>
      ))}
    </ol>
  )
}

/**
 * Order tracking of the customer area (RF15): timeline with every
 * status, delivery and installation date (RN05), tracking code when the
 * order has one, items and totals. Presentation only: the data comes
 * from the `getOrderTracking` Server Action, which checks the access.
 *
 * @param props - Order tracking.
 * @returns The tracking content.
 */
export function OrderTrackingView({ tracking }: { tracking: OrderTracking }) {
  const { shipment } = tracking
  return (
    <div className="grid gap-xl lg:grid-cols-[2fr_1fr]">
      <section aria-labelledby="timeline-title" className="flex flex-col">
        <h2 id="timeline-title" className="mb-md text-headline-sm">
          Acompanhamento
        </h2>
        <Timeline steps={tracking.timeline} />
      </section>

      <aside className="flex flex-col gap-md">
        <section
          aria-labelledby="delivery-title"
          className="flex flex-col gap-sm rounded-lg border border-line-subtle p-md"
        >
          <h2 id="delivery-title" className="text-subhead">
            Entrega
          </h2>
          <p className="text-body-sm text-ink">{tracking.address}</p>
          {tracking.scheduledDeliveryAt && (
            <p className="flex items-start gap-xs text-body-sm text-ink">
              <CalendarDaysIcon
                className="size-5 shrink-0 text-primary"
                aria-hidden
              />
              <span>
                Entrega e instalação agendadas para{" "}
                <time dateTime={tracking.scheduledDeliveryAt}>
                  {longDate.format(new Date(tracking.scheduledDeliveryAt))}
                </time>
                .
              </span>
            </p>
          )}
          {shipment?.manualQuote && (
            <p className="text-body-sm text-ink-muted">
              O frete está sendo cotado pela equipe comercial.
            </p>
          )}
          {shipment && !shipment.manualQuote && (
            <p className="text-body-sm text-ink-muted">
              {[shipment.carrier, shipment.service].filter(Boolean).join(" · ")}
            </p>
          )}
          {shipment?.trackingCode ? (
            <div className="flex flex-col gap-xs rounded bg-subtle p-sm">
              <span className="flex items-center gap-xs text-label text-ink">
                <PackageIcon className="size-5 text-primary" aria-hidden />
                Código de rastreio
              </span>
              <span className="font-mono text-body break-all text-ink select-all">
                {shipment.trackingCode}
              </span>
              {shipment.trackingUrl && (
                <a
                  href={shipment.trackingUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-xs text-body-sm text-primary underline"
                >
                  Rastrear no site dos Correios
                  <ExternalLinkIcon className="size-4" aria-hidden />
                  <span className="sr-only">(abre em nova aba)</span>
                </a>
              )}
            </div>
          ) : (
            <p className="text-body-sm text-ink-muted">
              O código de rastreio aparece aqui quando o pedido for enviado.
            </p>
          )}
        </section>

        <section
          aria-labelledby="items-title"
          className="flex flex-col gap-sm rounded-lg border border-line-subtle p-md"
        >
          <h2 id="items-title" className="text-subhead">
            Itens
          </h2>
          <ul className="flex flex-col gap-xs text-body-sm">
            {tracking.items.map((item) => (
              <li key={item.id} className="flex justify-between gap-sm">
                <span>{item.name}</span>
                <span className="shrink-0 text-ink-muted">
                  {item.quantity} un.
                </span>
              </li>
            ))}
          </ul>
          <p className="flex justify-between border-t border-line-subtle pt-sm text-body">
            <span>Total</span>
            <strong>{brl.format(Number(tracking.total))}</strong>
          </p>
          <p className="text-body-sm text-ink-muted">
            {tracking.paymentMethod} · pedido de {tracking.buyer} em{" "}
            {dateTime.format(new Date(tracking.createdAt))}
          </p>
          {tracking.ownOrder && (
            <Link
              href={`/conta/pedidos/${tracking.orderId}/pagamento`}
              className="text-body-sm text-primary underline"
            >
              Ver pagamento
            </Link>
          )}
        </section>
      </aside>
    </div>
  )
}
