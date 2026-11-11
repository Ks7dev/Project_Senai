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
