import { fromCents, toCents } from "@/features/shared/lib/shipping/strategies"

/** Status of an installment as stored (RF33). */
export type InstallmentStatusKey = "OPEN" | "PAID" | "CANCELED"

/** Status shown to people: an open installment past its due date is overdue. */
export type InstallmentStateKey = InstallmentStatusKey | "OVERDUE"

/** Label and tone of each shown status, in Portuguese. */
export const INSTALLMENT_STATE: Record<
  InstallmentStateKey,
  { label: string; tone: "neutral" | "done" | "problem" }
> = {
  OPEN: { label: "Em aberto", tone: "neutral" },
  OVERDUE: { label: "Vencido", tone: "problem" },
  PAID: { label: "Pago", tone: "done" },
  CANCELED: { label: "Cancelado", tone: "neutral" },
}

/** Settlement methods (RF33): by hand or by the bank return file. */
export const SETTLEMENT_METHOD_LABEL = {
  MANUAL: "Baixa manual",
  BANK_RETURN: "Retorno bancário",
} as const

/**
 * Fictitious bank code of the own boleto in homologation. A real bank
 * agreement (code, wallet and agreement number) replaces it in
 * production.
 */
export const DEMO_BOLETO_BANK_CODE = "999"

/** São Paulo offset from UTC (no daylight saving time since 2019). */
const SAO_PAULO_OFFSET_MS = -3 * 60 * 60 * 1000

/** One day, in milliseconds. */
const DAY_MS = 24 * 60 * 60 * 1000

/** An installment to create for an invoiced order. */
export type PlannedInstallment = {
  /** 1 for the first due date, 2 for the second. */
  sequence: number
  /** Days after the confirmation. */
  dueDays: number
  /** Amount, decimal string. */
  amount: string
  /** Due date: end of the day in São Paulo, as a UTC instant. */
  dueDate: Date
}

/**
 * End of the day in São Paulo, a number of days after an instant.
 *
 * @param from - Reference instant (the order confirmation).
 * @param days - Days to add.
 * @returns 23:59:59.999 in São Paulo of the resulting day, in UTC.
 */
export function dueDateAfter(from: Date, days: number): Date {
  const local = new Date(from.getTime() + SAO_PAULO_OFFSET_MS)
  const startOfLocalDay = Date.UTC(
    local.getUTCFullYear(),
    local.getUTCMonth(),
    local.getUTCDate()
  )
  return new Date(
    startOfLocalDay + (days + 1) * DAY_MS - 1 - SAO_PAULO_OFFSET_MS
  )
}

/**
 * Splits the order total into one installment per due date (RN03): equal
 * parts in cents, with the rounding remainder on the first one, so the
 * sum is always the order total.
 *
 * @param total - Order total, decimal string.
 * @param dueDays - Due dates in days, e.g. [28, 56].
 * @param confirmedAt - When the order was confirmed.
 * @returns The installments, in due date order.
 * @throws Error when there is no valid due date.
 */
export function planInstallments(
  total: string,
  dueDays: readonly number[],
  confirmedAt: Date
): PlannedInstallment[] {
  const days = [...new Set(dueDays)]
    .filter((day) => Number.isInteger(day) && day > 0)
    .sort((a, b) => a - b)
  if (days.length === 0) throw new Error("No invoiced due dates configured")
  const cents = toCents(total)
  const part = Math.floor(cents / days.length)
  const remainder = cents - part * days.length
  return days.map((day, index) => ({
    sequence: index + 1,
    dueDays: day,
    amount: fromCents(index === 0 ? part + remainder : part),
    dueDate: dueDateAfter(confirmedAt, day),
  }))
}

/**
 * Own boleto number ("nosso número") of an installment: the digits of
 * the order number plus the installment sequence, so it is unique.
 *
 * @param orderNumber - Readable order number, e.g. "AB-2026-000123".
 * @param sequence - Installment sequence.
 * @returns The number, e.g. "202600012301".
 */
export function boletoNumber(orderNumber: string, sequence: number): string {
  return `${orderNumber.replace(/\D/g, "")}${String(sequence).padStart(2, "0")}`
}

/**
 * Module 10 check digit of the digitable line fields (FEBRABAN).
 *
 * @param digits - Field digits.
 * @returns The check digit.
 */
export function mod10(digits: string): number {
  let sum = 0
  let weight = 2
  for (let index = digits.length - 1; index >= 0; index -= 1) {
    const product = Number(digits[index]) * weight
    sum += product > 9 ? Math.floor(product / 10) + (product % 10) : product
    weight = weight === 2 ? 1 : 2
  }
  const rest = sum % 10
  return rest === 0 ? 0 : 10 - rest
}

/**
 * Module 11 general check digit of the barcode (FEBRABAN): weights 2 to
 * 9 from the right; 0, 10 and 11 become 1.
 *
 * @param digits - The 43 barcode digits without the check digit.
 * @returns The check digit.
 */
export function mod11(digits: string): number {
  let sum = 0
  let weight = 2
  for (let index = digits.length - 1; index >= 0; index -= 1) {
    sum += Number(digits[index]) * weight
    weight = weight === 9 ? 2 : weight + 1
  }
  const result = 11 - (sum % 11)
  return result === 0 || result === 10 || result === 11 ? 1 : result
}

/**
 * Due date factor of the barcode: days since 1997-10-07, restarting at
 * 1000 on 2025-02-22 (FEBRABAN), computed on the São Paulo date.
 *
 * @param dueDate - Due date.
 * @returns The 4-digit factor.
 */
export function dueDateFactor(dueDate: Date): string {
  const local = new Date(dueDate.getTime() + SAO_PAULO_OFFSET_MS)
  const day = Date.UTC(
    local.getUTCFullYear(),
    local.getUTCMonth(),
    local.getUTCDate()
  )
  const days = Math.round((day - Date.UTC(1997, 9, 7)) / DAY_MS)
  const factor = days <= 9999 ? days : ((days - 10000) % 9000) + 1000
  return String(factor).padStart(4, "0")
}

/**
 * Digitable line of the own boleto (RF12), with the FEBRABAN layout and
 * check digits: bank and currency, free field with the boleto number,
 * general check digit, due date factor and amount. In homologation the
 * bank code is fictitious, so the line identifies the installment but
 * is not payable.
 *
 * @param input - Bank code, boleto number, due date and amount.
 * @returns The line, e.g. "99990.00002 ... 1 12340000050000".
 */
export function digitableLine(input: {
  bankCode: string
  boletoNumber: string
  dueDate: Date
  amount: string
}): string {
  const bank = `${input.bankCode.padStart(3, "0").slice(-3)}9`
  const free = input.boletoNumber
    .replace(/\D/g, "")
    .padStart(25, "0")
    .slice(-25)
  const amount = String(toCents(input.amount)).padStart(10, "0").slice(-10)
  const factor = dueDateFactor(input.dueDate)
  const general = mod11(`${bank}${factor}${amount}${free}`)
  const field1 = `${bank}${free.slice(0, 5)}`
  const field2 = free.slice(5, 15)
  const field3 = free.slice(15, 25)
  const withDigit = (field: string) => `${field}${mod10(field)}`
  const dotted = (field: string) => `${field.slice(0, 5)}.${field.slice(5)}`
  return [
    dotted(withDigit(field1)),
    dotted(withDigit(field2)),
    dotted(withDigit(field3)),
    String(general),
    `${factor}${amount}`,
  ].join(" ")
}

/**
 * Status shown for an installment: open past the due date is overdue.
 *
 * @param status - Stored status.
 * @param dueDate - Due date.
 * @param now - Reference time.
 * @returns The shown status.
 */
export function installmentState(
  status: InstallmentStatusKey,
  dueDate: Date,
  now: Date
): InstallmentStateKey {
  if (status === "OPEN" && dueDate.getTime() < now.getTime()) return "OVERDUE"
  return status
}
