import { randomUUID } from "node:crypto"
import { afterAll, describe, expect, it, vi } from "vitest"

try {
  process.loadEnvFile()
} catch {
  // Variables come from the environment (CI)
}

vi.mock("next/cache", () => ({
  revalidateTag: vi.fn(),
  cacheTag: vi.fn(),
  cacheLife: vi.fn(),
}))

const { prisma } = await import("@/features/shared/lib/db/prisma")
const { getCategoryWithSubtree } =
  await import("@/features/shared/lib/catalog/catalog-query")

const tag = randomUUID().slice(0, 8)
const ids: string[] = []

afterAll(async () => {
  for (const id of ids.reverse()) {
    await prisma.category.delete({ where: { id } })
  }
  await prisma.$disconnect()
})

describe("subcategory navigation (#23, RF01)", () => {
  it("returns the parent and the active subcategories in menu order", async () => {
    const parent = await prisma.category.create({
      data: { name: `Mesas ${tag}`, slug: `mesas-${tag}` },
    })
    ids.push(parent.id)
    const children = [
      { name: `Reunião ${tag}`, slug: `reuniao-${tag}`, position: 2 },
      { name: `Regulável ${tag}`, slug: `regulavel-${tag}`, position: 1 },
      {
        name: `Oculta ${tag}`,
        slug: `oculta-${tag}`,
        position: 0,
        active: false,
      },
    ]
    for (const child of children) {
      const row = await prisma.category.create({
        data: { ...child, parentId: parent.id },
      })
      ids.push(row.id)
    }

    const root = await getCategoryWithSubtree(`mesas-${tag}`)
    expect(root?.parent).toBeNull()
    expect(root?.children.map((child) => child.slug)).toEqual([
      `regulavel-${tag}`,
      `reuniao-${tag}`,
    ])
    expect(root?.ids).toHaveLength(3)

    const child = await getCategoryWithSubtree(`regulavel-${tag}`)
    expect(child?.parent).toEqual({
      name: `Mesas ${tag}`,
      slug: `mesas-${tag}`,
    })
    expect(child?.children).toEqual([])
  })
})
