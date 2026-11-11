import "server-only"
import type { Prisma } from "@/generated/prisma/client"
import { prisma } from "@/features/shared/lib/db/prisma"
import { getNumberSetting } from "@/features/shared/lib/settings/settings"
import { addBusinessDays } from "@/features/shared/lib/shipping/business-days"

/** Payment deadlines of Pix and boleto (RN14), from the settings table. */
export type PaymentDeadlines = {
  /** Minutes a Pix stays payable. */
  pixMinutes: number
  /** Business days a boleto stays payable. */
  boletoBusinessDays: number
}

/**
 * Reads the Pix and boleto deadlines (RN14). Values live in the
 * settings table (`payment.pix_expiration_minutes` and
 * `payment.boleto_expiration_business_days`), never in the code.
 *
 * @param client - Prisma client or transaction.
 * @returns The deadlines.
 */
export async function loadPaymentDeadlines(
  client: Pick<Prisma.TransactionClient, "setting"> = prisma
): Promise<PaymentDeadlines> {
  const [pixMinutes, boletoBusinessDays] = await Promise.all([
    getNumberSetting("payment.pix_expiration_minutes", client),
    getNumberSetting("payment.boleto_expiration_business_days", client),
  ])
  return { pixMinutes, boletoBusinessDays }
}

/**
 * When a Pix or boleto issued at `from` stops being payable (RN14).
 *
 * @param method - "PIX" or "BOLETO".
 * @param from - Issue time.
 * @param deadlines - Configured deadlines.
 * @returns The expiration time.
 */
export function paymentExpiresAt(
  method: "PIX" | "BOLETO",
  from: Date,
  deadlines: PaymentDeadlines
): Date {
  return method === "PIX"
    ? new Date(from.getTime() + deadlines.pixMinutes * 60_000)
    : addBusinessDays(from, deadlines.boletoBusinessDays)
}

/**
 * Formats a date as Mercado Pago expects in `date_of_expiration`
 * (`yyyy-MM-dd'T'HH:mm:ss.SSS+00:00`).
 *
 * @param date - Expiration time.
 * @returns The formatted date, in UTC.
 */
export function toMercadoPagoDate(date: Date): string {
  return date.toISOString().replace("Z", "+00:00")
}
