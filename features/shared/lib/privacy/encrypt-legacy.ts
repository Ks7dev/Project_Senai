import "server-only"
import {
  encryptPersonal,
  isEncryptedPersonal,
} from "@/features/shared/lib/crypto/personal-data-cipher"
import { prisma } from "@/features/shared/lib/db/prisma"
import { logger } from "@/features/shared/lib/logger/logger"

/** Prefix of an anonymized CPF placeholder, which is not personal data. */
const ANONYMIZED_PREFIX = "X"

/** Rows encrypted by one run of the backfill. */
export type LegacyEncryptionResult = {
  /** Users whose CPF or phone was encrypted. */
  users: number
  /** Demonstration requests whose phone was encrypted. */
  demoRequests: number
}

/**
 * Encrypts the CPFs and phones written before the encryption at rest
 * (RNF03). Runs when the server starts, so `docker compose up -d` on an
 * existing database leaves no plain value behind. Values already
 * encrypted and the anonymized CPF placeholders are skipped, so the run
 * is idempotent.
 *
 * @param client - Prisma client (tests pass their own).
 * @returns How many rows were encrypted.
 */
export async function encryptLegacyPersonalData(
  client: typeof prisma = prisma
): Promise<LegacyEncryptionResult> {
  const users = await client.user.findMany({
    where: {
      OR: [
        { NOT: { document: { startsWith: "v1." } } },
        { phone: { not: null }, NOT: { phone: { startsWith: "v1." } } },
      ],
    },
    select: { id: true, document: true, phone: true },
  })
  let changedUsers = 0
  for (const user of users) {
    const document =
      isEncryptedPersonal(user.document) ||
      user.document.startsWith(ANONYMIZED_PREFIX)
        ? user.document
        : encryptPersonal(user.document)
    const phone = user.phone ? encryptPersonal(user.phone) : user.phone
    if (document === user.document && phone === user.phone) continue
    await client.user.update({
      where: { id: user.id },
      data: { document, phone },
    })
    changedUsers += 1
  }

  const demos = await client.demoRequest.findMany({
    where: { phone: { not: null }, NOT: { phone: { startsWith: "v1." } } },
    select: { id: true, phone: true },
  })
  for (const demo of demos) {
    await client.demoRequest.update({
      where: { id: demo.id },
      data: { phone: encryptPersonal(demo.phone!) },
    })
  }

  const result = { users: changedUsers, demoRequests: demos.length }
  if (result.users || result.demoRequests) {
    logger.info("legacy personal data encrypted", result)
  }
  return result
}
