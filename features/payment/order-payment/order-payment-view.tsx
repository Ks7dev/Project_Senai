"use client"

import { useCallback, useEffect, useId, useRef, useState } from "react"
import Script from "next/script"
import { useRouter } from "next/navigation"
import { LockIcon } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import {
  payOrder,
  type OrderPaymentContext,
  type PaymentAttempt,
  type PaymentView,
} from "@/features/payment/order-payment/action/payment-actions"
import {
  createBricksBuilder,
  MERCADO_PAGO_SDK_URL,
  type BrickController,
  type BrickSubmit,
} from "@/features/shared/lib/mercadopago/bricks"
import { PAYMENT_STATUS } from "@/features/shared/lib/payments/payment-messages"

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

  const showForm = context.canPay && !attempt
  const { orderId, method, total, payerEmail, maxInstallments } = context

  const submit = useCallback(
    async ({ formData }: BrickSubmit) => {
      setError(undefined)
      const result = await payOrder({
        orderId,
        method: method as "CARD",
        formData: formData as never,
      })
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
          paymentMethods: {
            creditCard: "all",
            minInstallments: 1,
            maxInstallments,
          },
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

      {context.blockedReason && !attempt && (
        <p role="note" className="rounded bg-subtle p-sm text-body-sm text-ink">
          {context.blockedReason}
        </p>
      )}

      {attempt && (
        <p
          role="status"
          className="rounded bg-primary-tint p-sm text-body-sm text-ink"
        >
          {attempt.payment.message}
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

      <PaymentHistory payments={context.payments} />
    </div>
  )
}
