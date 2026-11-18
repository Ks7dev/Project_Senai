import type { UseFormRegisterReturn } from "react-hook-form"

/**
 * Wraps a react-hook-form registration so the input value is masked as
 * the user types (e.g. CPF, CNPJ and phone).
 *
 * @param field - Result of `form.register(...)`.
 * @param mask - Function that formats the raw value.
 * @returns The registration with a masking change handler.
 */
export function withMask<TName extends string>(
  field: UseFormRegisterReturn<TName>,
  mask: (value: string) => string
): UseFormRegisterReturn<TName> {
  return {
    ...field,
    onChange: (event) => {
      const input = event.target as HTMLInputElement
      input.value = mask(input.value)
      return field.onChange(event)
    },
  }
}
