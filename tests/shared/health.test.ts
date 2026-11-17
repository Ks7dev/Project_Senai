import { describe, expect, it, vi } from "vitest"

vi.mock("@/features/shared/lib/db/prisma", () => ({
  prisma: { $queryRaw: vi.fn() },
}))

const { checkHealth } = await import("@/features/shared/lib/db/health")

describe("health check (#80)", () => {
  it("reports ok when the database answers", async () => {
    const query = vi.fn().mockResolvedValue([{ 1: 1 }])
    await expect(checkHealth(query)).resolves.toEqual({
      status: "ok",
      database: "up",
    })
    expect(query).toHaveBeenCalledOnce()
  })

  it("reports unavailable without exposing the error", async () => {
    const query = vi
      .fn()
      .mockRejectedValue(new Error("connect ECONNREFUSED db:3306 secret"))
    const result = await checkHealth(query)
    expect(result).toEqual({ status: "unavailable", database: "down" })
    expect(JSON.stringify(result)).not.toContain("secret")
  })

  it("reports unavailable when the database does not answer in time", async () => {
    const query = () => new Promise(() => {})
    await expect(checkHealth(query, 10)).resolves.toEqual({
      status: "unavailable",
      database: "down",
    })
  })
})
