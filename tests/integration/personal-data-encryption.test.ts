import { randomUUID } from "node:crypto"
import { afterAll, describe, expect, it } from "vitest"

try {
  process.loadEnvFile()
} catch {
  // Variables come from the environment (CI)
}

const { prisma } = await import("@/features/shared/lib/db/prisma")
const { encryptLegacyPersonalData } =
  await import("@/features/shared/lib/privacy/encrypt-legacy")
const { decryptPersonal, encryptPersonal } =
  await import("@/features/shared/lib/crypto/personal-data-cipher")

const created: string[] = []

afterAll(async () => {
  await prisma.user.deleteMany({ where: { id: { in: created } } })
  await prisma.$disconnect()
})

describe("encryption at rest of CPF and phone (RNF03, #75)", () => {
  it("encrypts the plain rows left from before the encryption", async () => {
    const id = randomUUID()
    const cpf = `9${Date.now()}`.slice(0, 11)
    created.push(id)
    await prisma.user.create({
      data: {
        id,
        name: "Titular legado (fictício)",
        email: `legado-${id}@atelierbureau.test`,
        personType: "PF",
        document: cpf,
        phone: "11987654321",
      },
    })

    await encryptLegacyPersonalData()

    const [row] = await prisma.$queryRaw<
      Array<{ document: string; phone: string | null }>
    >`SELECT document, phone FROM users WHERE id = ${id}`
    expect(row.document).not.toBe(cpf)
    expect(row.phone).not.toContain("987654321")
    expect(decryptPersonal(row.document)).toBe(cpf)
    expect(decryptPersonal(row.phone)).toBe("11987654321")

    // A lookup by the CPF finds the encrypted row
    const found = await prisma.user.findUnique({
      where: { document: encryptPersonal(cpf) },
      select: { id: true },
    })
    expect(found?.id).toBe(id)
  })

  it("leaves no plain CPF or phone in the database and is idempotent", async () => {
    await encryptLegacyPersonalData()
    const plain = await prisma.$queryRaw<Array<{ total: bigint }>>`
      SELECT COUNT(*) AS total FROM users
      WHERE (document NOT LIKE 'v1.%' AND document NOT LIKE 'X%')
         OR (phone IS NOT NULL AND phone NOT LIKE 'v1.%')`
    expect(Number(plain[0].total)).toBe(0)
    expect(await encryptLegacyPersonalData()).toEqual({
      users: 0,
      demoRequests: 0,
    })
  })

  it("keeps the CPF unique after encryption", async () => {
    const [user] = await prisma.user.findMany({
      take: 1,
      select: { document: true },
      where: { document: { startsWith: "v1." } },
    })
    await expect(
      prisma.user.create({
        data: {
          id: randomUUID(),
          name: "Duplicado (fictício)",
          email: `duplicado-${randomUUID()}@atelierbureau.test`,
          personType: "PF",
          document: encryptPersonal(decryptPersonal(user.document)),
        },
      })
    ).rejects.toThrow()
  })
})
