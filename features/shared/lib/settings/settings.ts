import "server-only"
import type { Prisma } from "@/generated/prisma/client"
import { prisma } from "@/features/shared/lib/db/prisma"

/**
 * Reads a business rule value from the `settings` table (RN01, RN06,
 * RN14, RN16, RN20). Values are never hardcoded in the code.
 *
 * @param key - Setting key, e.g. "product.extended_warranty_threshold".
 * @param client - Prisma client or transaction (defaults to the app client).
 * @returns The stored JSON value.
 * @throws Error when the setting is missing (the seed creates them all).
 */
export async function getSetting(
  key: string,
  client: Pick<Prisma.TransactionClient, "setting"> = prisma
): Promise<unknown> {
  const row = await client.setting.findUnique({ where: { key } })
  if (!row) throw new Error(`Missing setting: ${key}`)
  return row.value
}

/**
 * Reads a numeric business rule value (stored as number or decimal
 * string).
 *
 * @param key - Setting key.
 * @param client - Prisma client or transaction.
 * @returns The number.
 */
export async function getNumberSetting(
  key: string,
  client?: Pick<Prisma.TransactionClient, "setting">
): Promise<number> {
  const value = Number(await getSetting(key, client))
  if (!Number.isFinite(value))
    throw new Error(`Setting is not a number: ${key}`)
  return value
}
