import { defineConfig } from "prisma/config"

// Loads .env when present (Node 24 built-in, no dotenv dependency)
try {
  process.loadEnvFile()
} catch {
  // No .env file: variables come from the environment (CI, Docker)
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    // Migrations run with the migration user (DDL allowed). The app
    // itself connects with DATABASE_URL, which has no DDL permission.
    url:
      process.env.MIGRATION_DATABASE_URL ??
      process.env.DATABASE_URL ??
      "mysql://placeholder:placeholder@localhost:3306/atelier_bureau",
    // `prisma migrate dev` replays the migrations in this database. The
    // migration user of the Docker MySQL cannot create databases, so the
    // init script creates `atelier_bureau_shadow` for it.
    shadowDatabaseUrl: process.env.SHADOW_DATABASE_URL || undefined,
  },
})
