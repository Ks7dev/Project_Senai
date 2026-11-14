import { beforeEach, describe, expect, it, vi } from "vitest"
import { institutionalPageSchema } from "@/features/backoffice/institutional-pages/schema/institutional-page-schema"
import { institutionalLinks } from "@/features/shared/config/navigation"
import {
  INSTITUTIONAL_SLUGS,
  isInstitutionalSlug,
} from "@/features/shared/lib/content/institutional-pages"
import {
  parseInline,
  parseSimpleMarkdown,
} from "@/features/shared/lib/content/simple-markdown"
import { institutionalPages } from "@/prisma/seed-institutional-pages"

describe("institutional pages (#74, RF57)", () => {
  it("links every page in the footer", () => {
    expect(institutionalLinks.map((link) => link.href)).toEqual(
      INSTITUTIONAL_SLUGS.map((slug) => `/${slug}`)
    )
  })

  it("seeds every page with the commercial policies text", () => {
    expect(institutionalPages.map((page) => page.slug).sort()).toEqual(
      [...INSTITUTIONAL_SLUGS].sort()
    )
    for (const page of institutionalPages) {
      expect(institutionalPageSchema.safeParse(page).success).toBe(true)
      expect(page.body).not.toContain("[DEFINIR]")
    }
    const privacy = institutionalPages.find(
      (page) => page.slug === "politica-de-privacidade"
    )
    expect(privacy?.body).toContain("só para viabilizar a compra")
    const exchanges = institutionalPages.find(
      (page) => page.slug === "trocas-e-devolucoes"
    )
    expect(exchanges?.body).toContain("avaliação técnica")
  })

  it("refuses unknown pages and empty texts", () => {
    expect(isInstitutionalSlug("garantia")).toBe(true)
    expect(isInstitutionalSlug("admin")).toBe(false)
    expect(
      institutionalPageSchema.safeParse({
        slug: "sobre",
        title: "Sobre",
        body: "Texto longo o bastante para a página.",
      }).success
    ).toBe(false)
    expect(
      institutionalPageSchema.safeParse({
        slug: "garantia",
        title: "Garantia",
        body: "curto",
      }).error?.issues[0]?.message
    ).toBe("Escreva o texto da página.")
  })
})

describe("institutional text format", () => {
  it("parses headings, lists, notes, tables and bold", () => {
    const blocks = parseSimpleMarkdown(
      [
        "> Nota",
        "",
        "## Prazos",
        "",
        "Primeira linha",
        "continua aqui.",
        "",
        "- **Legal:** 90 dias",
        "- Contratual",
        "",
        "1. Um",
        "2. Dois",
        "",
        "| A | B |",
        "|---|---|",
        "| 1 | 2 |",
        "---",
      ].join("\n")
    )
    expect(blocks.map((block) => block.type)).toEqual([
      "quote",
      "heading",
      "paragraph",
      "list",
      "list",
      "table",
      "rule",
    ])
    expect(blocks[2]).toEqual({
      type: "paragraph",
      spans: [{ text: "Primeira linha continua aqui.", bold: false }],
    })
    expect(blocks[3]).toMatchObject({
      ordered: false,
      items: [
        [
          { text: "Legal:", bold: true },
          { text: " 90 dias", bold: false },
        ],
        [{ text: "Contratual", bold: false }],
      ],
    })
    expect(blocks[5]).toMatchObject({
      header: [[{ text: "A" }], [{ text: "B" }]],
      rows: [[[{ text: "1" }], [{ text: "2" }]]],
    })
  })

  it("keeps markup as plain text", () => {
    expect(parseInline("<script>alert(1)</script> **x")).toEqual([
      { text: "<script>alert(1)</script> ", bold: false },
      { text: "**x", bold: false },
    ])
  })
})

const getCurrentUser = vi.fn()
const rolePermissionFindMany = vi.fn()
const pageFindUnique = vi.fn()
const pageUpsert = vi.fn()
const auditCreate = vi.fn()
const revalidateTag = vi.fn()

vi.mock("next/cache", () => ({
  revalidateTag: (...args: unknown[]) => revalidateTag(...args),
}))
vi.mock("@/features/shared/lib/auth/session", () => ({
  getCurrentUser: () => getCurrentUser(),
}))
const tx = {
  institutionalPage: {
    findUnique: (a: unknown) => pageFindUnique(a),
    upsert: (a: unknown) => pageUpsert(a),
  },
  auditLog: { create: (a: unknown) => auditCreate(a) },
}
vi.mock("@/features/shared/lib/db/prisma", () => ({
  prisma: {
    ...tx,
    rolePermission: { findMany: (a: unknown) => rolePermissionFindMany(a) },
    $transaction: async (fn: (client: typeof tx) => Promise<unknown>) => fn(tx),
  },
}))

const { saveInstitutionalPage } =
  await import("@/features/backoffice/institutional-pages/action/institutional-page-actions")

describe("saving an institutional page (#74)", () => {
  const input = {
    slug: "garantia" as const,
    title: "Garantia",
    body: "## Prazos\n\nGarantia legal de 90 dias.",
  }

  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(console, "warn").mockImplementation(() => {})
    getCurrentUser.mockResolvedValue({ id: "u-admin", name: "A", email: "a@b" })
    rolePermissionFindMany.mockResolvedValue([
      { permission: { resource: "content", action: "manage" } },
    ])
  })

  it("saves without a deploy, invalidates the cache and audits", async () => {
    pageFindUnique.mockResolvedValue({ title: "Garantia", body: "Antigo" })
    expect(await saveInstitutionalPage(input)).toEqual({ success: true })
    expect(pageUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { slug: "garantia" },
        update: expect.objectContaining({ updatedById: "u-admin" }),
      })
    )
    expect(auditCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: "content.page.update",
        entityId: "garantia",
        before: { title: "Garantia", body: "Antigo" },
      }),
    })
    expect(revalidateTag).toHaveBeenCalledWith("institutional-pages", "max")
  })

  it("refuses users without content:manage", async () => {
    rolePermissionFindMany.mockResolvedValue([])
    const result = await saveInstitutionalPage(input)
    expect(result.success).toBe(false)
    expect(pageUpsert).not.toHaveBeenCalled()
  })
})
