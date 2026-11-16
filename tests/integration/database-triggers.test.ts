import { randomUUID } from "node:crypto"
import { afterAll, describe, expect, it } from "vitest"

try {
  process.loadEnvFile()
} catch {
  // Variables come from the environment (CI)
}

const { prisma } = await import("@/features/shared/lib/db/prisma")

/** Error thrown by the rollback at the end of a probe transaction. */
class Rollback extends Error {}

/**
 * Runs statements in a transaction that is always rolled back, so the
 * probes leave no rows behind. Foreign key checks are off inside it, so
 * a probe does not need a real order.
 *
 * @param run - Statements of the probe.
 */
async function probe(
  run: (
    tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0]
  ) => Promise<unknown>
) {
  await prisma
    .$transaction(async (tx) => {
      await tx.$executeRawUnsafe("SET FOREIGN_KEY_CHECKS = 0")
      try {
        await run(tx)
      } finally {
        await tx.$executeRawUnsafe("SET FOREIGN_KEY_CHECKS = 1")
      }
      throw new Rollback()
    })
    .catch((error: unknown) => {
      if (!(error instanceof Rollback)) throw error
    })
}

afterAll(async () => {
  await prisma.$disconnect()
})

describe("database triggers (docs/banco-de-dados/05-gatilhos.md)", () => {
  it("keeps audit_logs append-only (RNF12)", async () => {
    await probe(async (tx) => {
      const id = randomUUID()
      await tx.$executeRawUnsafe(
        "INSERT INTO audit_logs (id, action, entity) VALUES (?, 'test.trigger', 'test')",
        id
      )
      await expect(
        tx.$executeRawUnsafe(
          "UPDATE audit_logs SET action = 'changed' WHERE id = ?",
          id
        )
      ).rejects.toThrow(/append-only/)
      await expect(
        tx.$executeRawUnsafe("DELETE FROM audit_logs WHERE id = ?", id)
      ).rejects.toThrow(/append-only/)
    })
  })

  it("keeps the order status history append-only (RF54)", async () => {
    await probe(async (tx) => {
      const id = randomUUID()
      await tx.$executeRawUnsafe(
        "INSERT INTO order_status_history (id, order_id, to_status) VALUES (?, ?, 'PAID')",
        id,
        randomUUID()
      )
      await expect(
        tx.$executeRawUnsafe(
          "DELETE FROM order_status_history WHERE id = ?",
          id
        )
      ).rejects.toThrow(/append-only/)
    })
  })

  it("refuses negative stock and edits to the stock ledger (RF43)", async () => {
    const stock = await prisma.stock.findFirstOrThrow({
      select: { skuId: true },
    })
    await expect(
      prisma.stock.update({
        where: { skuId: stock.skuId },
        data: { reserved: -1 },
      })
    ).rejects.toThrow(/must not be negative/)
    await probe(async (tx) => {
      const id = randomUUID()
      await tx.$executeRawUnsafe(
        "INSERT INTO stock_movements (id, sku_id, type, quantity) VALUES (?, ?, 'ADJUSTMENT', 1)",
        id,
        stock.skuId
      )
      await expect(
        tx.$executeRawUnsafe(
          "UPDATE stock_movements SET quantity = 5 WHERE id = ?",
          id
        )
      ).rejects.toThrow(/ledger/)
    })
  })

  it("refuses refunding more than the payment and non positive refunds (RF34)", async () => {
    await probe(async (tx) => {
      await expect(
        tx.$executeRawUnsafe(
          "INSERT INTO payments (id, order_id, method, amount, refunded_amount, updated_at) VALUES (?, ?, 'PIX', 100, 150, NOW(3))",
          randomUUID(),
          randomUUID()
        )
      ).rejects.toThrow(/refunded_amount/)
      await expect(
        tx.$executeRawUnsafe(
          "INSERT INTO refunds (id, order_id, kind, reason, channel, amount, status, note, requested_by_id, updated_at) VALUES (?, ?, 'FULL', 'CANCELLATION', 'MERCADO_PAGO', 0, 'PENDING_APPROVAL', 'teste', ?, NOW(3))",
          randomUUID(),
          randomUUID(),
          randomUUID()
        )
      ).rejects.toThrow(/must be positive/)
    })
  })

  it("refuses negative order amounts", async () => {
    await probe(async (tx) => {
      await expect(
        tx.$executeRawUnsafe(
          "INSERT INTO orders (id, number, user_id, status, payment_method, subtotal, total, shipping_address, updated_at) VALUES (?, ?, ?, 'AWAITING_PAYMENT', 'PIX', 10, -1, JSON_OBJECT(), NOW(3))",
          randomUUID(),
          `TRG-${Date.now()}`,
          randomUUID()
        )
      ).rejects.toThrow(/must not be negative/)
    })
  })

  it("locks the fiscal data of an issued NF-e (RF13)", async () => {
    await probe(async (tx) => {
      const id = randomUUID()
      await tx.$executeRawUnsafe(
        "INSERT INTO invoices (id, order_id, status, access_key, number, updated_at) VALUES (?, ?, 'ISSUED', ?, '1', NOW(3))",
        id,
        randomUUID(),
        "3".repeat(44)
      )
      await expect(
        tx.$executeRawUnsafe(
          "UPDATE invoices SET number = '2' WHERE id = ?",
          id
        )
      ).rejects.toThrow(/issued NF-e/)
      await tx.$executeRawUnsafe(
        "UPDATE invoices SET alerted_at = NOW(3) WHERE id = ?",
        id
      )
    })
  })

  it("keeps discount percentages between 0 and 100 (RF21, RN04)", async () => {
    await probe(async (tx) => {
      await expect(
        tx.$executeRawUnsafe(
          "INSERT INTO price_tables (id, name, discount_percent, updated_at) VALUES (?, 'Teste', 150, NOW(3))",
          randomUUID()
        )
      ).rejects.toThrow(/between 0 and 100/)
      await expect(
        tx.$executeRawUnsafe(
          "INSERT INTO volume_discounts (id, category_id, discount_percent, updated_at) VALUES (?, ?, -5, NOW(3))",
          randomUUID(),
          randomUUID()
        )
      ).rejects.toThrow(/between 0 and 100/)
    })
  })
})
