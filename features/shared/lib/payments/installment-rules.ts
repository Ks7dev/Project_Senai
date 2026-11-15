import "server-only"
import type { Prisma } from "@/generated/prisma/client"
import { prisma } from "@/features/shared/lib/db/prisma"
import { logger } from "@/features/shared/lib/logger/logger"
import { getSetting } from "@/features/shared/lib/settings/settings"
import {
  installmentRulesSchema,
  type InstallmentRule,
} from "@/features/shared/schema/installment-schema"

/** Settings key of the installment rules (RF14). */
export const INSTALLMENT_RULES_KEY = "payment.installment_rules"

/**
 * Reads the installment rules from the settings table (RF14). A missing
 * or unreadable value is logged and treated as "no rule", so the card
 * is charged in a single installment instead of allowing too many.
 *
 * @param client - Prisma client or transaction.
 * @returns The rules.
 */
export async function loadInstallmentRules(
  client: Pick<Prisma.TransactionClient, "setting"> = prisma
): Promise<InstallmentRule[]> {
  let value: unknown
  try {
    value = await getSetting(INSTALLMENT_RULES_KEY, client)
  } catch {
    logger.error("installment rules setting missing")
    return []
  }
  const parsed = installmentRulesSchema.safeParse(value)
  if (!parsed.success) {
    logger.error("invalid installment rules setting")
    return []
  }
  return parsed.data
}
