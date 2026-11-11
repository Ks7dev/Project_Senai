import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import {
  accounts,
  categories,
  corporateAccount,
  permissions,
  products,
  roles,
  settings,
  shippingRegions,
} from "@/prisma/seed-data"

const setting = (key: string) => settings.find((s) => s.key === key)?.value

describe("seed configuration (#5, #8)", () => {
  it("loads the business rule values confirmed in issue #5", () => {
    expect(setting("order.approval_limit")).toBe("10000.00")
    expect(setting("product.extended_warranty_threshold")).toBe("5000.00")
    expect(setting("payment.pix_expiration_minutes")).toBe(30)
    expect(setting("payment.boleto_expiration_business_days")).toBe(3)
    expect(setting("shipping.correios_max_weight_kg")).toBe(30)
    expect(setting("shipping.correios_max_side_cm")).toBe(100)
    expect(setting("shipping.correios_max_dimensions_sum_cm")).toBe(200)
    expect(setting("payment.invoiced_due_days")).toEqual([28, 56])
  })

  it("has unique setting keys", () => {
    const keys = settings.map((s) => s.key)
    expect(new Set(keys).size).toBe(keys.length)
  })

  it("covers the São Paulo Metropolitan Region for own delivery (RN16)", () => {
    const rmsp = shippingRegions.find((r) => r.ownDelivery)
    expect(rmsp?.cepStart).toMatch(/^\d{8}$/)
    expect(rmsp?.cepEnd).toMatch(/^\d{8}$/)
    expect(Number(rmsp?.cepStart)).toBeLessThan(Number(rmsp?.cepEnd))
  })
})

describe("seed permissions (RF55)", () => {
  it("defines the four internal roles", () => {
    expect(roles.map((r) => r.key).sort()).toEqual(
      ["admin", "finance", "sales", "stock"].sort()
    )
  })

  it("only grants existing permissions", () => {
    for (const role of roles) {
      for (const permission of role.permissions) {
        expect(permissions).toContain(permission)
      }
    }
  })

  it("uses the resource:action format", () => {
    for (const permission of permissions) {
      expect(permission).toMatch(/^[a-z]+(:[a-z]+)?:[a-z]+$/)
    }
  })
})

describe("seed catalog", () => {
  it("links every product to an existing category", () => {
    const slugs = categories.map((c) => c.slug)
    for (const product of products) expect(slugs).toContain(product.category)
  })

  it("has unique product slugs and SKU codes", () => {
    const productSlugs = products.map((p) => p.slug)
    const skuCodes = products.flatMap((p) => p.skus.map((s) => s.code))
    expect(new Set(productSlugs).size).toBe(productSlugs.length)
    expect(new Set(skuCodes).size).toBe(skuCodes.length)
  })

  it("uses decimal strings for money and mandatory weight and dimensions", () => {
    for (const product of products) {
      expect(product.price).toMatch(/^\d+\.\d{2}$/)
      expect(Number(product.weightKg)).toBeGreaterThan(0)
      for (const size of product.dimensionsCm) {
        expect(Number(size)).toBeGreaterThan(0)
      }
    }
  })
})

describe("seed accounts", () => {
  it("uses only fictitious e-mail domains", () => {
    for (const account of accounts) expect(account.email).toMatch(/\.test$/)
  })

  it("has unique e-mails and documents", () => {
    const emails = accounts.map((a) => a.email)
    const documents = accounts.map((a) => a.document)
    expect(new Set(emails).size).toBe(emails.length)
    expect(new Set(documents).size).toBe(documents.length)
  })

  it("gives the multi-user corporate account an approver and an admin (RN08)", () => {
    expect(corporateAccount.members.length).toBeGreaterThan(1)
    const roles = corporateAccount.members.flatMap((m) => m.role.split(","))
    expect(roles).toContain("approver")
    expect(roles).toContain("admin")
  })
})

describe("initial migration", () => {
  const sql = readFileSync(
    join(process.cwd(), "prisma/migrations/20261111120000_init/migration.sql"),
    "utf8"
  )

  it("uses utf8mb4 with accent-insensitive collation", () => {
    expect(sql).toContain("utf8mb4_0900_ai_ci")
    expect(sql).not.toContain("utf8mb4_unicode_ci")
  })

  it("stores money as DECIMAL(12, 2) and never as FLOAT or DOUBLE", () => {
    expect(sql).toMatch(/`base_price` DECIMAL\(12, 2\)/)
    expect(sql).toMatch(/`total` DECIMAL\(12, 2\)/)
    expect(sql).not.toMatch(/\b(FLOAT|DOUBLE)\b/)
  })

  it("has the unique keys required by issue #8", () => {
    for (const index of [
      "users_email_key",
      "users_document_key",
      "organizations_cnpj_key",
      "skus_code_key",
      "payments_payment_id_key",
    ]) {
      expect(sql).toContain(index)
    }
  })

  it("has a FULLTEXT index on product name and description", () => {
    expect(sql).toMatch(/FULLTEXT INDEX `products_name_description_idx`/)
  })

  it("declares foreign keys", () => {
    expect(sql).toMatch(/ADD CONSTRAINT `orders_user_id_fkey` FOREIGN KEY/)
  })
})
