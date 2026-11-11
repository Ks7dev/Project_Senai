"use client"

import { useCallback, useEffect, useId, useRef, useState } from "react"
import Script from "next/script"
import { useRouter } from "next/navigation"
import { CopyIcon, ExternalLinkIcon, LockIcon } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  getPaymentStatus,
  payOrder,
  type OrderPaymentContext,
  type PaymentAttempt,
  type PaymentStatusSnapshot,
  type PaymentView,
} from "@/features/payment/order-payment/action/payment-actions"
import {
  createBricksBuilder,
  MERCADO_PAGO_SDK_URL,
  type BrickController,
  type BrickSubmit,
} from "@/features/shared/lib/mercadopago/bricks"
import { ORDER_STATUS } from "@/features/shared/lib/orders/order-status"
import { PAYMENT_STATUS } from "@/features/shared/lib/payments/payment-messages"

/** Interval of the live status check while a payment is pending (RF31). */
const POLL_MS = 5_000

const brl = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
})

const dateTime = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "America/Sao_Paulo",
})

/**
 * Payment status badge (RF31).
 *
 * @param props - The payment.
 * @returns The badge.
 */
function PaymentStatusBadge({ payment }: { payment: PaymentView }) {
  const tone = PAYMENT_STATUS[payment.status]?.tone ?? "neutral"
  return (
    <Badge
      variant={
        tone === "problem"
          ? "destructive"
          : tone === "done"
            ? "default"
            : "outline"
      }
    >
      {payment.statusLabel}
    </Badge>
  )
}

/**
 * Payment attempts of the order with status and payment_id (RF31, RF32).
 *
 * @param props - The attempts.
 * @returns The list.
 */
function PaymentHistory({ payments }: { payments: PaymentView[] }) {
  if (payments.length === 0) return null
  return (
    <section aria-label="Pagamentos do pedido" className="flex flex-col gap-sm">
      <h2 className="text-headline-sm">Pagamentos</h2>
      <ul className="flex flex-col divide-y divide-line-subtle rounded-lg border border-line-subtle">
        {payments.map((payment) => (
          <li key={payment.id} className="flex flex-col gap-xs p-sm">
            <div className="flex flex-wrap items-center justify-between gap-sm text-body-sm">
              <span className="text-ink">
                {payment.methodLabel} · {brl.format(Number(payment.amount))}
                {payment.installments > 1 && ` em ${payment.installments}x`}
              </span>
              <PaymentStatusBadge payment={payment} />
            </div>
            <p className="text-body-sm text-ink-muted">{payment.message}</p>
            <p className="text-label-sm text-ink-muted">
              {dateTime.format(new Date(payment.createdAt))}
              {payment.paymentId &&
                ` · Código Mercado Pago ${payment.paymentId}`}
            </p>
          </li>
        ))}
      </ul>
    </section>
  )
}

/**
 * Payment methods the Brick shows for the order method (RF29).
 *
 * @param method - Order payment method.
 * @param maxInstallments - Most card installments allowed (RF14).
 * @returns The Brick `paymentMethods` customization.
 */
function brickPaymentMethods(
  method: string,
  maxInstallments: number
): Record<string, unknown> {
  if (method === "PIX") return { bankTransfer: ["pix"] }
  if (method === "BOLETO") return { ticket: ["bolbradesco"] }
  return { creditCard: "all", minInstallments: 1, maxInstallments }
}

/**
 * Button that copies a Pix code or a boleto line.
 *
 * @param props - Text to copy and the button label.
 * @returns The button.
 */
function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <Button
      type="button"
      variant="subtle"
      className="self-start"
      onClick={() => {
        navigator.clipboard
          ?.writeText(value)
          .then(() => setCopied(true))
          .catch(() => setCopied(false))
      }}
    >
      <CopyIcon aria-hidden />
      {copied ? "Copiado" : label}
    </Button>
  )
}

/**
 * Pix QR Code and copy-and-paste code, or the boleto line and PDF, of a
 * pending payment, with the deadline (RF29, RN14).
 *
 * @param props - The pending payment.
 * @returns The instructions, or null for a card payment.
 */
function PendingInstructions({ payment }: { payment: PaymentView }) {
  const id = useId()
  const deadline = payment.expiresAt
    ? `Pague até ${dateTime.format(new Date(payment.expiresAt))}. Depois disso, o pedido é cancelado e os itens voltam ao estoque.`
    : null
  if (payment.pix) {
    return (
      <section
        aria-labelledby={`${id}-pix`}
        className="flex flex-col gap-sm rounded-lg border border-line-subtle p-md"
      >
        <h2 id={`${id}-pix`} className="text-headline-sm">
          Pague com Pix
        </h2>
        {payment.pix.qrCodeImage && (
          // eslint-disable-next-line @next/next/no-img-element -- inline data URI from Mercado Pago
          <img
            src={`data:image/png;base64,${payment.pix.qrCodeImage}`}
            alt="QR Code Pix do pedido"
            width={220}
            height={220}
            className="self-center"
          />
        )}
        <label htmlFor={`${id}-code`} className="text-label">
          Pix copia e cola
        </label>
        <textarea
          id={`${id}-code`}
          readOnly
          value={payment.pix.qrCode}
          rows={3}
          className="w-full rounded border border-line-subtle bg-subtle p-sm text-body-sm break-all"
        />
        <CopyButton value={payment.pix.qrCode} label="Copiar código Pix" />
        {deadline && <p className="text-body-sm text-ink-muted">{deadline}</p>}
      </section>
    )
  }
  if (payment.boleto) {
    return (
      <section
        aria-labelledby={`${id}-boleto`}
        className="flex flex-col gap-sm rounded-lg border border-line-subtle p-md"
      >
        <h2 id={`${id}-boleto`} className="text-headline-sm">
          Pague o boleto
        </h2>
        {payment.boleto.line && (
          <>
            <label htmlFor={`${id}-line`} className="text-label">
              Linha digitável
            </label>
            <input
              id={`${id}-line`}
              readOnly
              value={payment.boleto.line}
              className="w-full rounded border border-line-subtle bg-subtle p-sm text-body-sm"
            />
            <CopyButton value={payment.boleto.line} label="Copiar linha" />
          </>
        )}
        {payment.boleto.url && (
          <a
            href={payment.boleto.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-xs text-body-sm text-primary underline"
          >
            Abrir o boleto em PDF
            <ExternalLinkIcon className="size-4" aria-hidden />
            <span className="sr-only">(abre em nova aba)</span>
          </a>
        )}
        {deadline && <p className="text-body-sm text-ink-muted">{deadline}</p>}
      </section>
    )
  }
  return null
}

/**
 * Payment of an order with the Mercado Pago Payment Brick (RF28, RF35,
 * RF36, RF37). The card is typed in the Brick, which tokenizes it in
 * the browser: only the token goes to the Server Action (RN19). When the
 * issuer asks for 3DS, the Status Screen Brick runs the challenge.
 * Presentation only: the amount and the rules are checked on the server.
 *
 * @param props - The order payment context.
 * @returns The payment content.
 */
export function OrderPaymentView({
  context,
}: {
  context: OrderPaymentContext
}) {
  const id = useId().replace(/:/g, "")
  const paymentContainer = `${id}-payment-brick`
  const statusContainer = `${id}-status-brick`
  const router = useRouter()
  const [sdkReady, setSdkReady] = useState(false)
  const [attempt, setAttempt] = useState<PaymentAttempt>()
  const [error, setError] = useState<string>()
  const controller = useRef<BrickController | null>(null)
  // Live status polled from the server; a new server render wins
  const [polled, setPolled] = useState<{
    from: OrderPaymentContext
    snapshot: PaymentStatusSnapshot
  } | null>(null)
  const snapshot: PaymentStatusSnapshot =
    polled && polled.from === context
      ? polled.snapshot
      : { orderStatus: context.status, payments: context.payments }

  const showForm = context.canPay && !attempt
  const pendingPayment =
    snapshot.payments.find((payment) => payment.status === "PENDING") ??
    (attempt?.payment.status === "PENDING" ? attempt.payment : undefined)
  const attemptMessage = attempt
    ? (snapshot.payments.find((payment) => payment.id === attempt.payment.id)
        ?.message ?? attempt.payment.message)
    : undefined
  const latest = snapshot.payments[0]
  const waiting = snapshot.payments.some(
    (payment) => payment.status === "PENDING"
  )
  const { orderId, method, total, payerEmail, maxInstallments } = context

  // Live status (RF31): while a payment is pending, ask the server every
  // few seconds; when it settles, the page is rendered again
  useEffect(() => {
    if (!waiting) return
    let stopped = false
    const timer = setInterval(async () => {
      if (document.visibilityState === "hidden") return
      const result = await getPaymentStatus({ orderId })
      if (stopped || !result.success) return
      setPolled({ from: context, snapshot: result.snapshot })
      if (!result.snapshot.payments.some((p) => p.status === "PENDING")) {
        router.refresh()
      }
    }, POLL_MS)
    return () => {
      stopped = true
      clearInterval(timer)
    }
  }, [waiting, orderId, context, router])

  const submit = useCallback(
    async ({ formData }: BrickSubmit) => {
      setError(undefined)
      const result = await payOrder({
        orderId,
        method,
        formData,
      } as never)
      if (!result.success) {
        setError(result.error)
        return
      }
      setAttempt(result.attempt)
      router.refresh()
    },
    [orderId, method, router]
  )

  // Payment Brick: mounted while the customer may pay
  useEffect(() => {
    if (!sdkReady || !showForm || !context.publicKey) return
    const builder = createBricksBuilder(context.publicKey)
    if (!builder) return
    let active = true
    builder
      .create("payment", paymentContainer, {
        initialization: { amount: Number(total), payer: { email: payerEmail } },
        customization: {
          paymentMethods: brickPaymentMethods(method, maxInstallments),
        },
        callbacks: {
          onReady: () => undefined,
          onSubmit: (data: BrickSubmit) => submit(data),
          onError: () =>
            setError(
              "Não foi possível carregar o formulário de pagamento. Recarregue a página."
            ),
        },
      })
      .then((brick) => {
        if (active) controller.current = brick
        else brick.unmount()
      })
      .catch(() =>
        setError(
          "Não foi possível carregar o formulário de pagamento. Recarregue a página."
        )
      )
    return () => {
      active = false
      controller.current?.unmount()
      controller.current = null
    }
  }, [
    sdkReady,
    showForm,
    context.publicKey,
    paymentContainer,
    total,
    payerEmail,
    maxInstallments,
    method,
    submit,
  ])

  // Status Screen Brick: runs the 3DS challenge when the issuer asks
  const threeDs = attempt?.threeDs
  useEffect(() => {
    if (!sdkReady || !threeDs || !context.publicKey) return
    const builder = createBricksBuilder(context.publicKey)
    if (!builder) return
    let brick: BrickController | null = null
    let active = true
    builder
      .create("statusScreen", statusContainer, {
        initialization: {
          paymentId: threeDs.paymentId,
          additionalInfo: {
            externalResourceURL: threeDs.externalResourceUrl,
            creq: threeDs.creq,
          },
        },
        callbacks: {
          onReady: () => undefined,
          onError: () =>
            setError("Não foi possível abrir a autenticação do banco."),
        },
      })
      .then((created) => {
        if (active) brick = created
        else created.unmount()
      })
      .catch(() => setError("Não foi possível abrir a autenticação do banco."))
    return () => {
      active = false
      brick?.unmount()
    }
  }, [sdkReady, threeDs, context.publicKey, statusContainer])

  return (
    <div className="flex flex-col gap-lg">
      {(context.canPay || threeDs) && (
        <Script
          src={MERCADO_PAGO_SDK_URL}
          strategy="afterInteractive"
          onReady={() => setSdkReady(true)}
        />
      )}

      <section className="flex flex-wrap items-baseline justify-between gap-sm rounded-lg bg-subtle p-md">
        <span className="text-body-sm text-ink-muted">
          {context.methodLabel}
        </span>
        <strong className="text-headline-md text-ink">
          {brl.format(Number(context.total))}
        </strong>
      </section>

      <p
        role="status"
        aria-live="polite"
        className="flex flex-wrap items-center gap-sm text-body-sm text-ink"
      >
        <span>
          Pedido: <strong>{ORDER_STATUS[snapshot.orderStatus].label}</strong>
        </span>
        {latest && (
          <span>
            · Pagamento: <strong>{latest.statusLabel}</strong>
          </span>
        )}
        {waiting && (
          <span className="text-ink-muted">· atualizado automaticamente</span>
        )}
      </p>

      {context.blockedReason && !attempt && (
        <p role="note" className="rounded bg-subtle p-sm text-body-sm text-ink">
          {context.blockedReason}
        </p>
      )}

      {attemptMessage && (
        <p className="rounded bg-primary-tint p-sm text-body-sm text-ink">
          {attemptMessage}
        </p>
      )}

      {error && (
        <p role="alert" className="text-body-sm text-error">
          {error}
        </p>
      )}

      {showForm && (
        <section aria-label="Formulário de pagamento" className="flex flex-col">
          {!sdkReady && (
            <p className="text-body-sm text-ink-muted">
              Carregando o formulário seguro do Mercado Pago…
            </p>
          )}
          <div id={paymentContainer} />
          <p className="mt-sm flex items-center gap-xs text-label-sm text-ink-muted">
            <LockIcon className="size-4" aria-hidden />
            Os dados do cartão são processados pelo Mercado Pago e não passam
            pelos nossos servidores.
          </p>
        </section>
      )}

      {threeDs && <div id={statusContainer} />}

      {pendingPayment && <PendingInstructions payment={pendingPayment} />}

      {attempt?.payment.status === "REJECTED" && context.canPay && (
        <button
          type="button"
          className="self-start text-body-sm text-primary underline"
          onClick={() => {
            setAttempt(undefined)
            setError(undefined)
          }}
        >
          Tentar novamente
        </button>
      )}

      <PaymentHistory payments={snapshot.payments} />
    </div>
  )
}
