/**
 * Removes everything that is not a digit.
 *
 * @param value - Raw input, e.g. "123.456.789-09".
 * @returns Only the digits.
 */
export function onlyDigits(value: string): string {
  return value.replace(/\D/g, "")
}

/**
 * Validates a CPF by its two check digits (RF39). Rejects sequences of
 * the same digit, such as 111.111.111-11.
 *
 * @param value - CPF with or without punctuation.
 * @returns True when the CPF is valid.
 */
export function isValidCpf(value: string): boolean {
  const cpf = onlyDigits(value)
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false
  const digit = (length: number) => {
    let sum = 0
    for (let i = 0; i < length; i++) {
      sum += Number(cpf[i]) * (length + 1 - i)
    }
    const rest = (sum * 10) % 11
    return rest === 10 ? 0 : rest
  }
  return digit(9) === Number(cpf[9]) && digit(10) === Number(cpf[10])
}

/**
 * Validates a CNPJ by its two check digits (RF39). Rejects sequences of
 * the same digit.
 *
 * @param value - CNPJ with or without punctuation.
 * @returns True when the CNPJ is valid.
 */
export function isValidCnpj(value: string): boolean {
  const cnpj = onlyDigits(value)
  if (cnpj.length !== 14 || /^(\d)\1{13}$/.test(cnpj)) return false
  const digit = (length: number) => {
    const weights =
      length === 12
        ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
        : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
    const sum = weights.reduce((acc, w, i) => acc + Number(cnpj[i]) * w, 0)
    const rest = sum % 11
    return rest < 2 ? 0 : 11 - rest
  }
  return digit(12) === Number(cnpj[12]) && digit(13) === Number(cnpj[13])
}

/**
 * Formats a CPF as 000.000.000-00.
 *
 * @param value - CPF digits.
 * @returns The formatted CPF.
 */
export function formatCpf(value: string): string {
  return onlyDigits(value).replace(
    /^(\d{3})(\d{3})(\d{3})(\d{2})$/,
    "$1.$2.$3-$4"
  )
}

/**
 * Formats a CNPJ as 00.000.000/0000-00.
 *
 * @param value - CNPJ digits.
 * @returns The formatted CNPJ.
 */
export function formatCnpj(value: string): string {
  return onlyDigits(value).replace(
    /^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/,
    "$1.$2.$3/$4-$5"
  )
}

/** Brazilian area codes (DDD) assigned by Anatel. */
const AREA_CODES = new Set([
  11, 12, 13, 14, 15, 16, 17, 18, 19, 21, 22, 24, 27, 28, 31, 32, 33, 34, 35,
  37, 38, 41, 42, 43, 44, 45, 46, 47, 48, 49, 51, 53, 54, 55, 61, 62, 63, 64,
  65, 66, 67, 68, 69, 71, 73, 74, 75, 77, 79, 81, 82, 83, 84, 85, 86, 87, 88,
  89, 91, 92, 93, 94, 95, 96, 97, 98, 99,
])

/**
 * Validates a Brazilian phone with area code: a mobile has 11 digits
 * and starts with 9 after the DDD; a landline has 10 digits and starts
 * with 2 to 5. Rejects unknown DDDs and repeated digits.
 *
 * @param value - Phone with or without punctuation.
 * @returns True when the phone is valid.
 */
export function isValidPhone(value: string): boolean {
  const phone = onlyDigits(value)
  if (/^(\d)\1+$/.test(phone)) return false
  if (!AREA_CODES.has(Number(phone.slice(0, 2)))) return false
  if (phone.length === 11) return phone[2] === "9"
  if (phone.length === 10) return /[2-5]/.test(phone[2])
  return false
}

/**
 * Applies a digit pattern progressively while the user types; each `0`
 * in the pattern takes one digit and extra digits are dropped.
 *
 * @param value - Raw input.
 * @param pattern - Pattern such as "000.000.000-00".
 * @returns The partially formatted value.
 */
function applyMask(value: string, pattern: string): string {
  const digits = onlyDigits(value)
  let result = ""
  let index = 0
  for (const char of pattern) {
    if (index >= digits.length) break
    if (char === "0") {
      result += digits[index]
      index++
    } else {
      result += char
    }
  }
  return result
}

/**
 * Masks a CPF while typing (000.000.000-00), keeping at most 11 digits.
 *
 * @param value - Raw input.
 * @returns The masked CPF.
 */
export function maskCpf(value: string): string {
  return applyMask(value, "000.000.000-00")
}

/**
 * Masks a CNPJ while typing (00.000.000/0000-00), keeping at most 14
 * digits.
 *
 * @param value - Raw input.
 * @returns The masked CNPJ.
 */
export function maskCnpj(value: string): string {
  return applyMask(value, "00.000.000/0000-00")
}

/**
 * Masks a phone while typing: (00) 0000-0000 for landlines and
 * (00) 00000-0000 for mobiles, keeping at most 11 digits.
 *
 * @param value - Raw input.
 * @returns The masked phone.
 */
export function maskPhone(value: string): string {
  return onlyDigits(value).length > 10
    ? applyMask(value, "(00) 00000-0000")
    : applyMask(value, "(00) 0000-0000")
}

/**
 * Accepts only internal paths as a post-login destination, so the
 * `redirect` query cannot send the user to another site.
 *
 * @param value - Raw destination from the query string.
 * @param fallback - Path used when the value is not safe.
 * @returns A safe internal path.
 */
export function safeRedirectPath(
  value: string | null | undefined,
  fallback = "/conta"
): string {
  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return fallback
  }
  if (value.includes("\\") || /^\/[a-z]+:/i.test(value)) return fallback
  return value
}
