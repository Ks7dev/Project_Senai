import "server-only"
import { processEmailQueue } from "@/features/shared/lib/email/mailer"
import type { Job } from "@/features/shared/lib/jobs/scheduler"
import { expireUnpaidOrders } from "@/features/shared/lib/orders/order-expiration"
import { reconcilePendingPayments } from "@/features/shared/lib/payments/payment-reconciliation"
import { expireQuotes } from "@/features/shared/lib/quotes/quote-expiration"

/** One minute, in milliseconds. */
const MINUTE = 60_000

/**
 * Background jobs of the app server:
 * - cancels unpaid Pix and boleto orders and releases their stock
 *   (RN14), checked every minute because Pix expires in minutes; the
 *   expired payments are read from Mercado Pago first, so one paid at
 *   the last minute is confirmed instead of canceled (#57);
 * - reconciles the pending payments whose webhook did not arrive with
 *   `GET /v1/payments/{id}` (#57);
 * - delivers the transactional e-mail queue with retries (RF53);
 * - marks the quotes past their validity as expired, so their prices
 *   are revalidated before an order (RN02).
 */
export const appJobs: readonly Job[] = [
  {
    name: "expire-unpaid-orders",
    everyMs: MINUTE,
    run: async () => {
      const now = new Date()
      await reconcilePendingPayments({ now, expiredOnly: true })
      return expireUnpaidOrders(now)
    },
  },
  {
    name: "reconcile-payments",
    everyMs: 5 * MINUTE,
    run: () => reconcilePendingPayments(),
  },
  {
    name: "deliver-email-queue",
    everyMs: 30_000,
    run: () => processEmailQueue(),
  },
  {
    name: "expire-quotes",
    everyMs: 10 * MINUTE,
    run: () => expireQuotes(),
  },
]
