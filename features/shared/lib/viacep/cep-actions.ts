"use server"

import {
  cepLookupSchema,
  INVALID_CEP_MESSAGE,
  type CepLookupInput,
} from "@/features/shared/schema/cep-schema"
import {
  AppError,
  toActionError,
  type ActionResult,
} from "@/features/shared/lib/errors/action-result"
import { enforceActionRateLimit } from "@/features/shared/lib/rate-limit/action-limit"
import {
  lookupCep,
  type CepLookupResult,
} from "@/features/shared/lib/viacep/viacep"

/**
 * Fills the address from the CEP for the address form and the checkout
 * (RF22). The CEP is validated with 8 digits before ViaCEP is called
 * (RF24). Public, because the CEP is not personal data and the cart may
 * be anonymous; rate limited per IP. A ViaCEP failure is still a
 * success with status "unavailable", so the form frees manual typing
 * and never blocks the purchase (RF23, RF38, RN21).
 *
 * @param input - CEP as typed.
 * @returns `{ success: true, lookup }` or `{ success: false, error }`.
 */
export async function lookupAddressByCep(
  input: CepLookupInput
): Promise<ActionResult<{ lookup: CepLookupResult }>> {
  try {
    const parsed = cepLookupSchema.safeParse(input)
    if (!parsed.success) throw new AppError(INVALID_CEP_MESSAGE, "invalid")
    await enforceActionRateLimit("cep", { limit: 30, windowMs: 60_000 })
    return { success: true, lookup: await lookupCep(parsed.data.cep) }
  } catch (error) {
    return toActionError(error, { action: "lookupAddressByCep" })
  }
}
