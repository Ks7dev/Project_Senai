"use server"

import { revalidateTag } from "next/cache"
import {
  institutionalPageSchema,
  type InstitutionalPageInput,
} from "@/features/backoffice/institutional-pages/schema/institutional-page-schema"
import {
  INSTITUTIONAL_CACHE_TAG,
  INSTITUTIONAL_SLUGS,
  INSTITUTIONAL_TITLES,
  type InstitutionalPageContent,
} from "@/features/shared/lib/content/institutional-pages"
import { writeAudit } from "@/features/shared/lib/db/audit"
import { requirePermission } from "@/features/shared/lib/db/permissions"
import { prisma } from "@/features/shared/lib/db/prisma"
import {
  AppError,
  toActionError,
  type ActionResult,
} from "@/features/shared/lib/errors/action-result"

/**
 * Loads the four institutional pages for the editor (RF57); a page
 * never saved comes with its default title and an empty text.
 *
 * @returns `{ success: true, pages }` or `{ success: false, error }`.
 */
export async function listInstitutionalPages(): Promise<
  ActionResult<{ pages: InstitutionalPageContent[] }>
> {
  try {
    await requirePermission("content:manage")
    const rows = await prisma.institutionalPage.findMany({
      where: { slug: { in: [...INSTITUTIONAL_SLUGS] } },
    })
    const bySlug = new Map(rows.map((row) => [row.slug, row]))
    return {
      success: true,
      pages: INSTITUTIONAL_SLUGS.map((slug) => {
        const row = bySlug.get(slug)
        return {
          slug,
          title: row?.title ?? INSTITUTIONAL_TITLES[slug],
          body: row?.body ?? "",
          updatedAt: row?.updatedAt.toISOString() ?? null,
        }
      }),
    }
  } catch (error) {
    return toActionError(error, { action: "listInstitutionalPages" })
  }
}

/**
 * Saves an institutional page (RF57). Takes effect without a deploy:
 * the page cache is invalidated. The change is audited with the text
 * before and after (RNF12).
 *
 * @param input - Page route, title and text.
 * @returns `{ success: true }` or `{ success: false, error }`.
 */
export async function saveInstitutionalPage(
  input: InstitutionalPageInput
): Promise<ActionResult> {
  try {
    const parsed = institutionalPageSchema.safeParse(input)
    if (!parsed.success) {
      throw new AppError(
        parsed.error.issues[0]?.message ?? "Revise a página.",
        "invalid"
      )
    }
    const { user } = await requirePermission("content:manage")
    const { slug, title, body } = parsed.data
    await prisma.$transaction(async (tx) => {
      const before = await tx.institutionalPage.findUnique({ where: { slug } })
      await tx.institutionalPage.upsert({
        where: { slug },
        create: { slug, title, body, updatedById: user.id },
        update: { title, body, updatedById: user.id },
      })
      await writeAudit(tx, {
        userId: user.id,
        action: "content.page.update",
        entity: "institutional_page",
        entityId: slug,
        before: before ? { title: before.title, body: before.body } : undefined,
        after: { title, body },
      })
    })
    revalidateTag(INSTITUTIONAL_CACHE_TAG, "max")
    return { success: true }
  } catch (error) {
    return toActionError(error, { action: "saveInstitutionalPage" })
  }
}
