"use server"

import {
  installmentRulesFormSchema,
  type InstallmentRulesFormInput,
} from "@/features/payment/installments/schema/installments-schema"
import { writeAudit } from "@/features/shared/lib/db/audit"
import { requirePermission } from "@/features/shared/lib/db/permissions"
import { prisma } from "@/features/shared/lib/db/prisma"
import {
  AppError,
  toActionError,
  type ActionResult,
} from "@/features/shared/lib/errors/action-result"
import {
  INSTALLMENT_RULES_KEY,
  loadInstallmentRules,
} from "@/features/shared/lib/payments/installment-rules"
import {
  INSTALLMENT_PROFILES,
  type InstallmentRule,
} from "@/features/shared/schema/installment-schema"

/** Description of the setting, shown in the back office. */
const SETTING_DESCRIPTION =
  "Máximo de parcelas no cartão por faixa de valor do pedido e por perfil de cliente (RF14)"

/**
 * Sorts the rules by profile and starting amount, as the screen shows.
 *
 * @param rules - Rules.
 * @returns A sorted copy.
 */
function sortRules(rules: InstallmentRule[]): InstallmentRule[] {
  return [...rules].sort(
    (a, b) =>
      INSTALLMENT_PROFILES.indexOf(a.profile) -
        INSTALLMENT_PROFILES.indexOf(b.profile) ||
      Number(a.minTotal) - Number(b.minTotal)
  )
}

/**
 * Loads the installment ranges for the back office (RF14). Requires
 * `setting:manage`.
 *
 * @returns `{ success: true, rules, updatedAt }` or `{ success: false, error }`.
 */
export async function getInstallmentRules(): Promise<
  ActionResult<{ rules: InstallmentRule[]; updatedAt: string | null }>
> {
  try {
    await requirePermission("setting:manage")
    const [rules, row] = await Promise.all([
      loadInstallmentRules(),
      prisma.setting.findUnique({
        where: { key: INSTALLMENT_RULES_KEY },
        select: { updatedAt: true },
      }),
    ])
    return {
      success: true,
      rules: sortRules(rules),
      updatedAt: row?.updatedAt.toISOString() ?? null,
    }
  } catch (error) {
    return toActionError(error, { action: "getInstallmentRules" })
  }
}

/**
 * Saves the installment ranges (RF14): validates them, checks
 * `setting:manage` with the user from the session and, in one
 * transaction, stores the setting with who changed it and writes the
 * audit log (RNF12). The Brick and the payment action read the new
 * ranges right away.
 *
 * @param input - Every range.
 * @returns `{ success: true, rules }` or `{ success: false, error }`.
 */
export async function saveInstallmentRules(
  input: InstallmentRulesFormInput
): Promise<ActionResult<{ rules: InstallmentRule[] }>> {
  try {
    const parsed = installmentRulesFormSchema.safeParse(input)
    if (!parsed.success) {
      throw new AppError(
        parsed.error.issues[0]?.message ?? "Revise as faixas de parcelamento.",
        "invalid"
      )
    }
    const { user } = await requirePermission("setting:manage")
    const rules = sortRules(parsed.data.rules)
    await prisma.$transaction(async (tx) => {
      const before = await tx.setting.findUnique({
        where: { key: INSTALLMENT_RULES_KEY },
        select: { value: true },
      })
      await tx.setting.upsert({
        where: { key: INSTALLMENT_RULES_KEY },
        create: {
          key: INSTALLMENT_RULES_KEY,
          value: rules,
          description: SETTING_DESCRIPTION,
          updatedById: user.id,
        },
        update: { value: rules, updatedById: user.id },
      })
      await writeAudit(tx, {
        userId: user.id,
        action: "setting.update",
        entity: "setting",
        entityId: INSTALLMENT_RULES_KEY,
        before: before?.value ?? null,
        after: rules,
      })
    })
    return { success: true, rules }
  } catch (error) {
    return toActionError(error, { action: "saveInstallmentRules" })
  }
}
