import { randomBytes } from "node:crypto"
import { pathToFileURL } from "node:url"
import { accounts as seedAccounts } from "../prisma/seed-data"

/**
 * Rotates or disables the fictitious seed accounts on the delivery
 * server (#179, PCI 2.2.2): their known password (SEED_PASSWORD or the
 * development default) must not work there. Run on the server machine,
 * in the project folder, with the `.env` of the server:
 *
 *   npx tsx scripts/rotate-seed-accounts.ts --dry-run
 *   npx tsx scripts/rotate-seed-accounts.ts              (new passwords)
 *   npx tsx scripts/rotate-seed-accounts.ts --disable    (unknown ones)
 *
 * Step by step in docs/AtelierBureau_Checklist_Lancamento.md.
 */

/** What happens to each seed account. */
export type RotationMode = "rotate" | "disable"

/** Command line options. */
export type RotationOptions = {
  /** `rotate` prints a new strong password; `disable` discards it. */
  mode: RotationMode
  /** Only reports what would change. */
  dryRun: boolean
  /** E-mails left untouched (e.g. an account kept for the demo). */
  keep: string[]
}

/** A seed account found in the database. */
export type SeedUser = { id: string; email: string }

/** Database operations the rotation needs (Prisma in production). */
export type SeedAccountStore = {
  /**
   * Finds the users with these e-mails.
   *
   * @param emails - Seed e-mails.
   * @returns The users that exist.
   */
  findUsers: (emails: string[]) => Promise<SeedUser[]>
  /**
   * Replaces the password hash, ends every session and writes the audit
   * log, in one transaction.
   *
   * @param user - The account.
   * @param passwordHash - New password hash.
   * @param mode - Rotation mode, recorded in the audit log.
   * @returns How many credential rows were updated.
   */
  replacePassword: (
    user: SeedUser,
    passwordHash: string,
    mode: RotationMode
  ) => Promise<number>
}

/** Outcome for one seed account. */
export type RotationResult = {
  /** Seed e-mail. */
  email: string
  /** What happened. */
  status:
    "rotated" | "disabled" | "kept" | "not_found" | "no_password" | "planned"
  /** New password, only for `rotated` (shown once, never logged). */
  password?: string
}

/** Pluggable crypto, injectable for tests. */
export type RotationDeps = {
  /** Hashes a password the way Better Auth does. */
  hash: (password: string) => Promise<string>
  /** Generates a strong random password. */
  generatePassword: () => string
}

/**
 * Reads the command line options.
 *
 * @param argv - Arguments after the script name.
 * @returns The options.
 * @throws Error on an unknown option or a `--keep` without e-mail.
 */
export function parseRotationArgs(argv: string[]): RotationOptions {
  const options: RotationOptions = { mode: "rotate", dryRun: false, keep: [] }
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index]
    if (arg === "--dry-run") options.dryRun = true
    else if (arg === "--disable") options.mode = "disable"
    else if (arg === "--keep") {
      const email = argv[++index]
      if (!email || email.startsWith("--")) {
        throw new Error("--keep needs an e-mail")
      }
      options.keep.push(email.toLowerCase())
    } else throw new Error(`unknown option: ${arg}`)
  }
  return options
}

/**
 * Generates a strong random password: 24 random bytes in base64url
 * (32 characters, about 192 bits).
 *
 * @returns The password.
 */
export function generateStrongPassword(): string {
  return randomBytes(24).toString("base64url")
}

/**
 * Rotates or disables each seed account. In `disable` mode the new
 * password is random and discarded, so nobody knows it; in `rotate`
 * mode it is returned once for the team's password manager. Every
 * session of the account is ended either way.
 *
 * @param store - Database operations.
 * @param options - Mode, dry run and kept e-mails.
 * @param deps - Hash and password generator.
 * @param emails - Seed e-mails (defaults to the seed accounts).
 * @returns One result per seed e-mail.
 */
export async function rotateSeedAccounts(
  store: SeedAccountStore,
  options: RotationOptions,
  deps: RotationDeps,
  emails: string[] = seedAccounts.map((account) => account.email)
): Promise<RotationResult[]> {
  const users = await store.findUsers(emails)
  const byEmail = new Map(users.map((user) => [user.email.toLowerCase(), user]))
  const results: RotationResult[] = []
  for (const email of emails) {
    const user = byEmail.get(email.toLowerCase())
    if (!user) {
      results.push({ email, status: "not_found" })
      continue
    }
    if (options.keep.includes(email.toLowerCase())) {
      results.push({ email, status: "kept" })
      continue
    }
    if (options.dryRun) {
      results.push({ email, status: "planned" })
      continue
    }
    const password = deps.generatePassword()
    const updated = await store.replacePassword(
      user,
      await deps.hash(password),
      options.mode
    )
    if (updated === 0) {
      results.push({ email, status: "no_password" })
    } else if (options.mode === "rotate") {
      results.push({ email, status: "rotated", password })
    } else {
      results.push({ email, status: "disabled" })
    }
  }
  return results
}

/** Text shown for each status. */
const STATUS_LABEL: Record<RotationResult["status"], string> = {
  rotated: "new password",
  disabled: "disabled (random password discarded)",
  kept: "kept unchanged (--keep)",
  not_found: "not in this database",
  no_password: "no password login (nothing to change)",
  planned: "would change (dry run)",
}

/**
 * Formats the report printed on the terminal.
 *
 * @param results - Rotation results.
 * @param options - Options used.
 * @returns The report lines.
 */
export function formatRotationReport(
  results: RotationResult[],
  options: RotationOptions
): string[] {
  const lines = results.map((result) =>
    result.password
      ? `${result.email}: ${STATUS_LABEL[result.status]}: ${result.password}`
      : `${result.email}: ${STATUS_LABEL[result.status]}`
  )
  if (options.dryRun) {
    lines.push(
      `Dry run (${options.mode}): nothing was changed. Run again without --dry-run.`
    )
  } else if (results.some((result) => result.password)) {
    lines.push(
      "Store these passwords in the team's password manager now: they are not saved anywhere and will not be shown again."
    )
  }
  return lines
}

/**
 * Connects to the database of the `.env` and runs the rotation.
 *
 * @param argv - Command line arguments.
 * @returns Process exit code.
 */
export async function main(argv: string[]): Promise<number> {
  let options: RotationOptions
  try {
    options = parseRotationArgs(argv)
  } catch (error) {
    process.stderr.write(`${(error as Error).message}\n`)
    process.stderr.write(
      "Usage: npx tsx scripts/rotate-seed-accounts.ts [--dry-run] [--disable] [--keep <email>]\n"
    )
    return 2
  }
  try {
    process.loadEnvFile()
  } catch {
    // No .env file: variables come from the environment
  }
  const url = process.env.DATABASE_URL
  if (!url) {
    process.stderr.write("DATABASE_URL is not set\n")
    return 2
  }

  const { PrismaMariaDb } = await import("@prisma/adapter-mariadb")
  const { hashPassword } = await import("better-auth/crypto")
  const { PrismaClient } = await import("../generated/prisma/client")
  const { mariaDbConfig } =
    await import("../features/shared/lib/db/connection-config")
  const prisma = new PrismaClient({
    adapter: new PrismaMariaDb(mariaDbConfig(url)),
  })

  const store: SeedAccountStore = {
    findUsers: (emails) =>
      prisma.user.findMany({
        where: { email: { in: emails } },
        select: { id: true, email: true },
      }),
    replacePassword: (user, passwordHash, mode) =>
      prisma.$transaction(async (tx) => {
        const { count } = await tx.account.updateMany({
          where: { userId: user.id, providerId: "credential" },
          data: { password: passwordHash },
        })
        if (count === 0) return 0
        await tx.session.deleteMany({ where: { userId: user.id } })
        // Audit in the same transaction (RNF12); never the password
        await tx.auditLog.create({
          data: {
            userId: null,
            action:
              mode === "rotate"
                ? "seed_account.rotate_password"
                : "seed_account.disable",
            entity: "user",
            entityId: user.id,
            after: { sessionsEnded: true },
          },
        })
        return count
      }),
  }

  try {
    const results = await rotateSeedAccounts(store, options, {
      hash: hashPassword,
      generatePassword: generateStrongPassword,
    })
    for (const line of formatRotationReport(results, options)) {
      process.stdout.write(`${line}\n`)
    }
    return 0
  } catch (error) {
    process.stderr.write(
      `Rotation failed: ${error instanceof Error ? error.name : "unknown error"}\n`
    )
    return 1
  } finally {
    await prisma.$disconnect()
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main(process.argv.slice(2)).then((code) => process.exit(code))
}
