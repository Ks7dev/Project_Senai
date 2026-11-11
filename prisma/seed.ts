import { randomUUID } from "node:crypto"
import { PrismaMariaDb } from "@prisma/adapter-mariadb"
import { hashPassword } from "better-auth/crypto"
import { PrismaClient } from "../generated/prisma/client"
import { mariaDbConfig } from "../features/shared/lib/db/connection-config"
import {
  accounts,
  categories,
  corporateAccount,
  permissions,
  products,
  roles,
  settings,
  shippingRegions,
} from "./seed-data"

try {
  process.loadEnvFile()
} catch {
  // No .env file: variables come from the environment
}

const url = process.env.MIGRATION_DATABASE_URL ?? process.env.DATABASE_URL
if (!url) throw new Error("DATABASE_URL is not set")

const prisma = new PrismaClient({
  adapter: new PrismaMariaDb(mariaDbConfig(url)),
})

/** Development password for the fictitious accounts (never production). */
const seedPassword = process.env.SEED_PASSWORD ?? "atelier-demo-2026"

/**
 * Seeds configuration, permissions, catalog and test accounts. It is
 * idempotent: running it again updates the same rows (upsert).
 */
async function main() {
  for (const setting of settings) {
    await prisma.setting.upsert({
      where: { key: setting.key },
      create: {
        key: setting.key,
        value: setting.value as never,
        description: setting.description,
      },
      update: { description: setting.description },
    })
  }

  for (const region of shippingRegions) {
    const existing = await prisma.shippingRegion.findFirst({
      where: { cepStart: region.cepStart, cepEnd: region.cepEnd },
    })
    if (!existing) {
      await prisma.shippingRegion.create({
        data: { ...region, ownDeliveryRates: region.ownDeliveryRates },
      })
    }
  }

  for (const permission of permissions) {
    const [resource, action] = splitPermission(permission)
    await prisma.permission.upsert({
      where: { resource_action: { resource, action } },
      create: { resource, action },
      update: {},
    })
  }

  for (const role of roles) {
    const saved = await prisma.role.upsert({
      where: { key: role.key },
      create: { key: role.key, name: role.name },
      update: { name: role.name },
    })
    for (const permission of role.permissions) {
      const [resource, action] = splitPermission(permission)
      const savedPermission = await prisma.permission.findUniqueOrThrow({
        where: { resource_action: { resource, action } },
      })
      await prisma.rolePermission.upsert({
        where: {
          roleId_permissionId: {
            roleId: saved.id,
            permissionId: savedPermission.id,
          },
        },
        create: { roleId: saved.id, permissionId: savedPermission.id },
        update: {},
      })
    }
  }

  const categoryIds = new Map<string, string>()
  for (const [position, category] of categories.entries()) {
    const saved = await prisma.category.upsert({
      where: { slug: category.slug },
      create: { ...category, position },
      update: { name: category.name, position },
    })
    categoryIds.set(category.slug, saved.id)
  }

  const warrantyThreshold = Number(
    settings.find((s) => s.key === "product.extended_warranty_threshold")?.value
  )
  for (const product of products) {
    const [lengthCm, widthCm, heightCm] = product.dimensionsCm
    const data = {
      categoryId: categoryIds.get(product.category)!,
      name: product.name,
      description: product.description,
      brand: product.brand,
      specs: product.specs,
      basePrice: product.price,
      weightKg: product.weightKg,
      lengthCm,
      widthCm,
      heightCm,
      warrantyMonths: product.warrantyMonths,
      includesExtendedWarranty: Number(product.price) > warrantyThreshold,
      requiresInstallation: product.requiresInstallation ?? false,
      personalizable: product.personalizable ?? false,
      status: "ACTIVE" as const,
    }
    const saved = await prisma.product.upsert({
      where: { slug: product.slug },
      create: { slug: product.slug, ...data },
      update: data,
    })
    for (const sku of product.skus) {
      const savedSku = await prisma.sku.upsert({
        where: { code: sku.code },
        create: {
          productId: saved.id,
          code: sku.code,
          name: sku.name,
          attributes: sku.attributes,
        },
        update: { name: sku.name, attributes: sku.attributes },
      })
      await prisma.stock.upsert({
        where: { skuId: savedSku.id },
        create: { skuId: savedSku.id, onHand: sku.stock },
        update: {},
      })
    }
  }

  const passwordHash = await hashPassword(seedPassword)
  const userIds = new Map<string, string>()
  for (const account of accounts) {
    const user = await prisma.user.upsert({
      where: { email: account.email },
      create: {
        id: randomUUID(),
        email: account.email,
        name: account.name,
        emailVerified: true,
        personType: account.personType,
        document: account.document,
      },
      update: { name: account.name },
    })
    userIds.set(account.email, user.id)
    const credential = await prisma.account.findFirst({
      where: { userId: user.id, providerId: "credential" },
    })
    if (!credential) {
      await prisma.account.create({
        data: {
          id: randomUUID(),
          userId: user.id,
          accountId: user.id,
          providerId: "credential",
          password: passwordHash,
        },
      })
    }
    for (const roleKey of account.roles ?? []) {
      const role = await prisma.role.findUniqueOrThrow({
        where: { key: roleKey },
      })
      await prisma.userRole.upsert({
        where: { userId_roleId: { userId: user.id, roleId: role.id } },
        create: { userId: user.id, roleId: role.id },
        update: {},
      })
    }
  }

  const organization = await prisma.organization.upsert({
    where: { slug: corporateAccount.slug },
    create: {
      id: randomUUID(),
      name: corporateAccount.name,
      slug: corporateAccount.slug,
      cnpj: corporateAccount.cnpj,
      legalName: corporateAccount.legalName,
      creditStatus: "APPROVED",
      creditLimit: corporateAccount.creditLimit,
      sellerId: userIds.get("comercial@atelierbureau.test"),
      createdAt: new Date(),
    },
    update: {},
  })
  for (const member of corporateAccount.members) {
    const userId = userIds.get(member.email)!
    await prisma.member.upsert({
      where: {
        organizationId_userId: { organizationId: organization.id, userId },
      },
      create: {
        id: randomUUID(),
        organizationId: organization.id,
        userId,
        role: member.role,
        createdAt: new Date(),
      },
      update: { role: member.role },
    })
  }
}

/**
 * Splits "resource[:sub]:action" into resource and action.
 *
 * @param permission - Permission string.
 * @returns Resource and action.
 */
function splitPermission(permission: string): [string, string] {
  const index = permission.lastIndexOf(":")
  return [permission.slice(0, index), permission.slice(index + 1)]
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error)
    await prisma.$disconnect()
    process.exit(1)
  })
