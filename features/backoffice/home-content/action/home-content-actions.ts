"use server"

import { randomUUID } from "node:crypto"
import { revalidateTag } from "next/cache"
import { z } from "zod"
import {
  CONTENT_CACHE_TAG,
  HOME_CONTENT_KEY,
  homeContentSchema,
  parseHomeContent,
  type HomeContent,
} from "@/features/shared/lib/content/home-content"
import { writeAudit } from "@/features/shared/lib/db/audit"
import { requirePermission } from "@/features/shared/lib/db/permissions"
import { prisma } from "@/features/shared/lib/db/prisma"
import {
  AppError,
  toActionError,
  type ActionResult,
} from "@/features/shared/lib/errors/action-result"
import { processProductImage } from "@/features/shared/lib/images/process-image"
import { saveFile } from "@/features/shared/lib/storage/storage"

/**
 * Loads the home content for the editor.
 *
 * @returns `{ success: true, content }` or `{ success: false, error }`.
 */
export async function getHomeContentForEdit(): Promise<
  ActionResult<{ content: HomeContent }>
> {
  try {
    await requirePermission("content:manage")
    const row = await prisma.setting.findUnique({
      where: { key: HOME_CONTENT_KEY },
    })
    return { success: true, content: parseHomeContent(row?.value) }
  } catch (error) {
    return toActionError(error, { action: "getHomeContentForEdit" })
  }
}

/**
 * Saves the home carousel and showcases (RF47). Takes effect without a
 * deploy: the home cache is invalidated.
 *
 * @param input - Home content.
 * @returns `{ success: true }` or `{ success: false, error }`.
 */
export async function saveHomeContent(
  input: HomeContent
): Promise<ActionResult> {
  try {
    const parsed = homeContentSchema.safeParse(input)
    if (!parsed.success) {
      throw new AppError(
        parsed.error.issues[0]?.message ?? "Revise o conteúdo.",
        "invalid"
      )
    }
    const { user } = await requirePermission("content:manage")
    await prisma.$transaction(async (tx) => {
      const before = await tx.setting.findUnique({
        where: { key: HOME_CONTENT_KEY },
      })
      await tx.setting.upsert({
        where: { key: HOME_CONTENT_KEY },
        create: {
          key: HOME_CONTENT_KEY,
          value: parsed.data,
          description: "Carrossel e vitrines da home (RF47)",
          updatedById: user.id,
        },
        update: { value: parsed.data, updatedById: user.id },
      })
      await writeAudit(tx, {
        userId: user.id,
        action: "content.home.update",
        entity: "setting",
        entityId: undefined,
        before: before?.value,
        after: parsed.data,
      })
    })
    revalidateTag(CONTENT_CACHE_TAG, "max")
    return { success: true }
  } catch (error) {
    return toActionError(error, { action: "saveHomeContent" })
  }
}

/**
 * Uploads a carousel image, converted to responsive WebP (RNF04).
 *
 * @param formData - The `file` field.
 * @returns `{ success: true, imageKey }` or `{ success: false, error }`.
 */
export async function uploadHomeImage(
  formData: FormData
): Promise<ActionResult<{ imageKey: string }>> {
  try {
    await requirePermission("content:manage")
    const file = formData.get("file")
    if (!(file instanceof File) || file.size === 0) {
      throw new AppError("Escolha uma imagem.", "no_file")
    }
    const variants = await processProductImage(
      Buffer.from(await file.arrayBuffer())
    )
    const imageKey = `content/home/${z.uuid().parse(randomUUID())}`
    for (const variant of variants) {
      await saveFile(`${imageKey}-${variant.width}.webp`, variant.data)
    }
    return { success: true, imageKey }
  } catch (error) {
    return toActionError(error, { action: "uploadHomeImage" })
  }
}
