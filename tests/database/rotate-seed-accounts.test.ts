import { describe, expect, it, vi } from "vitest"
import {
  formatRotationReport,
  generateStrongPassword,
  parseRotationArgs,
  rotateSeedAccounts,
  type SeedAccountStore,
} from "@/scripts/rotate-seed-accounts"
import { accounts } from "@/prisma/seed-data"

const EMAILS = ["admin@atelierbureau.test", "cliente.pf@atelierbureau.test"]

/**
 * In-memory store with both seed users present.
 *
 * @param updated - Credential rows each update reports.
 * @returns The store and its spies.
 */
function fakeStore(updated = 1) {
  const replacePassword = vi.fn().mockResolvedValue(updated)
  const store: SeedAccountStore = {
    findUsers: vi.fn().mockResolvedValue([
      { id: "u1", email: "admin@atelierbureau.test" },
      { id: "u2", email: "cliente.pf@atelierbureau.test" },
    ]),
    replacePassword,
  }
  return { store, replacePassword }
}

const deps = {
  hash: vi.fn(async (password: string) => `hash(${password})`),
  generatePassword: vi.fn(() => "Strong-Random-Password-0000000000"),
}

describe("seed account rotation (#179)", () => {
  it("parses the options", () => {
    expect(parseRotationArgs([])).toEqual({
      mode: "rotate",
      dryRun: false,
      keep: [],
    })
    expect(
      parseRotationArgs([
        "--dry-run",
        "--disable",
        "--keep",
        "Admin@AtelierBureau.test",
      ])
    ).toEqual({
      mode: "disable",
      dryRun: true,
      keep: ["admin@atelierbureau.test"],
    })
    expect(() => parseRotationArgs(["--keep"])).toThrow(/needs an e-mail/)
    expect(() => parseRotationArgs(["--force"])).toThrow(/unknown option/)
  })

  it("generates strong, distinct passwords", () => {
    const first = generateStrongPassword()
    expect(first).toMatch(/^[A-Za-z0-9_-]{32}$/)
    expect(generateStrongPassword()).not.toBe(first)
  })

  it("changes nothing on a dry run", async () => {
    const { store, replacePassword } = fakeStore()
    const results = await rotateSeedAccounts(
      store,
      { mode: "rotate", dryRun: true, keep: [] },
      deps,
      [...EMAILS, "missing@atelierbureau.test"]
    )
    expect(replacePassword).not.toHaveBeenCalled()
    expect(results.map((result) => result.status)).toEqual([
      "planned",
      "planned",
      "not_found",
    ])
  })

  it("rotates to a new hashed password and returns it once", async () => {
    const { store, replacePassword } = fakeStore()
    const results = await rotateSeedAccounts(
      store,
      { mode: "rotate", dryRun: false, keep: [] },
      deps,
      EMAILS
    )
    expect(replacePassword).toHaveBeenCalledWith(
      { id: "u1", email: "admin@atelierbureau.test" },
      "hash(Strong-Random-Password-0000000000)",
      "rotate"
    )
    expect(results[0]).toEqual({
      email: "admin@atelierbureau.test",
      status: "rotated",
      password: "Strong-Random-Password-0000000000",
    })
  })

  it("disables without revealing the password and honours --keep", async () => {
    const { store, replacePassword } = fakeStore()
    const options = {
      mode: "disable" as const,
      dryRun: false,
      keep: ["cliente.pf@atelierbureau.test"],
    }
    const results = await rotateSeedAccounts(store, options, deps, EMAILS)
    expect(replacePassword).toHaveBeenCalledOnce()
    expect(results).toEqual([
      { email: "admin@atelierbureau.test", status: "disabled" },
      { email: "cliente.pf@atelierbureau.test", status: "kept" },
    ])
    expect(formatRotationReport(results, options).join("\n")).not.toContain(
      "Strong-Random-Password"
    )
  })

  it("reports accounts without password login", async () => {
    const { store } = fakeStore(0)
    const results = await rotateSeedAccounts(
      store,
      { mode: "rotate", dryRun: false, keep: [] },
      deps,
      ["admin@atelierbureau.test"]
    )
    expect(results).toEqual([
      { email: "admin@atelierbureau.test", status: "no_password" },
    ])
  })

  it("covers every seed account by default", async () => {
    const { store } = fakeStore()
    await rotateSeedAccounts(
      store,
      { mode: "rotate", dryRun: true, keep: [] },
      deps
    )
    expect(store.findUsers).toHaveBeenCalledWith(
      accounts.map((account) => account.email)
    )
  })

  it("prints the passwords once with a warning", () => {
    const lines = formatRotationReport(
      [
        {
          email: "admin@atelierbureau.test",
          status: "rotated",
          password: "abc",
        },
      ],
      { mode: "rotate", dryRun: false, keep: [] }
    )
    expect(lines[0]).toBe("admin@atelierbureau.test: new password: abc")
    expect(lines[1]).toMatch(/password manager/)
  })
})
