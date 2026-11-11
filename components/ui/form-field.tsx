import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"

type FormFieldProps = {
  /** Id of the control, used by the label and the error message. */
  id: string
  /** Visible label. */
  label: string
  /** Validation message; marks the field as invalid when present. */
  error?: string
  /** Optional help text below the control. */
  hint?: string
  /** Extra classes for the wrapper. */
  className?: string
  /** The control (input, select...). Receives aria attributes by id. */
  children: React.ReactNode
}

/**
 * Label, control, help text and error message, with the error linked
 * to the control through `aria-describedby` (RNF13).
 *
 * @param props - Field id, label, error, hint and the control.
 * @returns The field.
 */
export function FormField({
  id,
  label,
  error,
  hint,
  className,
  children,
}: FormFieldProps) {
  return (
    <div className={cn("flex flex-col gap-xs", className)}>
      <Label htmlFor={id}>{label}</Label>
      {children}
      {hint && !error && (
        <p id={`${id}-hint`} className="text-body-sm text-ink-muted">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} role="alert" className="text-body-sm text-error">
          {error}
        </p>
      )}
    </div>
  )
}

/**
 * Accessibility props for a control rendered inside FormField.
 *
 * @param id - Control id.
 * @param error - Validation message, if any.
 * @returns `aria-invalid` and `aria-describedby`.
 */
export function fieldAria(id: string, error?: string) {
  return {
    "aria-invalid": error ? true : undefined,
    "aria-describedby": error ? `${id}-error` : undefined,
  }
}
