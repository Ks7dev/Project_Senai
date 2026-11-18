import { spawnSync } from "node:child_process"
import {
  chmodSync,
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

const ENTRYPOINT = join(process.cwd(), "deploy", "app", "entrypoint.sh")

/** Secrets the web server must never hold (SEC-003, #220). */
const SECRETS = [
  "MIGRATION_DATABASE_URL",
  "SHADOW_DATABASE_URL",
  "MYSQL_ROOT_PASSWORD",
  "MYSQL_APP_PASSWORD",
  "MYSQL_MIGRATE_PASSWORD",
  "MYSQL_BACKUP_PASSWORD",
  "MYSQL_DEV_PASSWORD",
  "CLOUDFLARE_TUNNEL_TOKEN",
  "SEED_PASSWORD",
]

describe("app entrypoint (SEC-003, #220)", () => {
  const script = readFileSync(ENTRYPOINT, "utf8")

  it("unsets every secret after the migration and before the server", () => {
    const migrate = script.indexOf("migrate deploy")
    const unset = script.indexOf("unset ")
    const server = script.indexOf("exec node deploy/app/cluster.mjs")
    expect(migrate).toBeGreaterThan(-1)
    expect(unset).toBeGreaterThan(migrate)
    expect(server).toBeGreaterThan(unset)
    const unsetBlock = script.slice(unset, server)
    for (const name of SECRETS) expect(unsetBlock).toContain(name)
  })

  it("keeps the variables the app reads at runtime", () => {
    const unsetBlock = script.slice(
      script.indexOf("unset "),
      script.indexOf("echo", script.indexOf("unset "))
    )
    const names = unsetBlock.split(/[\s\\]+/).filter(Boolean)
    expect(names.slice(1).sort()).toEqual([...SECRETS].sort())
    for (const name of [
      "DATABASE_URL",
      "BETTER_AUTH_SECRET",
      "DATA_ENCRYPTION_KEY",
    ]) {
      expect(names).not.toContain(name)
    }
  })

  it.skipIf(process.platform === "win32")(
    "starts the server without the secrets in its environment",
    () => {
      const dir = mkdtempSync(join(tmpdir(), "entrypoint-"))
      try {
        const bin = join(dir, "bin")
        mkdirSync(bin)
        mkdirSync(join(dir, "migrate"))
        copyFileSync(ENTRYPOINT, join(dir, "entrypoint.sh"))
        // Fake node: the migration sees the secrets, the server prints
        // the names of what it got
        const fakeNode = join(bin, "node")
        writeFileSync(
          fakeNode,
          [
            "#!/bin/sh",
            'if [ "$1" = "deploy/app/cluster.mjs" ]; then env | cut -d= -f1; exit 0; fi',
            '[ -n "$MIGRATION_DATABASE_URL" ] || exit 9',
            "exit 0",
            "",
          ].join("\n")
        )
        chmodSync(fakeNode, 0o755)

        const secrets = Object.fromEntries(SECRETS.map((n) => [n, "fake"]))
        const result = spawnSync("sh", ["./entrypoint.sh"], {
          cwd: dir,
          encoding: "utf8",
          env: {
            NODE_ENV: "production",
            PATH: `${bin}:${process.env.PATH ?? ""}`,
            DATABASE_URL: "mysql://app@db/x",
            ...secrets,
          },
        })
        expect(result.status).toBe(0)
        const names = result.stdout.split("\n")
        expect(names).toContain("DATABASE_URL")
        for (const name of SECRETS) expect(names).not.toContain(name)
      } finally {
        rmSync(dir, { recursive: true, force: true })
      }
    }
  )
})
