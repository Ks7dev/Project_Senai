import { logger, type LogFields } from "@/features/shared/lib/logger/logger"

/** Result returned by every Server Action. Actions never throw to the UI. */
export type ActionResult<T extends object = object> =
  ({ success: true } & T) | { success: false; error: string }

/** Generic message shown when an unexpected error happens (RNF05). */
export const GENERIC_ERROR_MESSAGE =
  "Não foi possível concluir a operação. Tente novamente em instantes."

/**
 * Expected business error whose message is safe to show to the user
 * (for example "Estoque insuficiente"). Any other error is treated as
 * internal and replaced by a generic message.
 */
export class AppError extends Error {
  /**
   * Creates an expected error.
   *
   * @param publicMessage - Message shown to the user, in Portuguese.
   * @param code - Stable code for logs and tests.
   */
  constructor(
    public readonly publicMessage: string,
    public readonly code = "app_error"
  ) {
    super(publicMessage)
    this.name = "AppError"
  }
}

/**
 * Converts any error into a failed ActionResult without leaking stack
 * traces or internal details (RNF05). Unexpected errors are logged.
 *
 * @param error - The caught error.
 * @param context - Extra log fields (action name, request id).
 * @returns `{ success: false, error }` with a user-safe message.
 */
export function toActionError(
  error: unknown,
  context: LogFields = {}
): { success: false; error: string } {
  if (error instanceof AppError) {
    logger.warn("action rejected", { ...context, code: error.code })
    return { success: false, error: error.publicMessage }
  }
  logger.error("action failed", { ...context, error })
  return { success: false, error: GENERIC_ERROR_MESSAGE }
}
