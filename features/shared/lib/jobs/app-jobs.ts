import "server-only"
import type { Job } from "@/features/shared/lib/jobs/scheduler"
import { expireUnpaidOrders } from "@/features/shared/lib/orders/order-expiration"

/** One minute, in milliseconds. */
const MINUTE = 60_000

/**
 * Background jobs of the app server:
 * - cancels unpaid Pix and boleto orders and releases their stock
 *   (RN14), checked every minute because Pix expires in minutes.
 */
export const appJobs: readonly Job[] = [
  {
    name: "expire-unpaid-orders",
    everyMs: MINUTE,
    run: () => expireUnpaidOrders(),
  },
]
