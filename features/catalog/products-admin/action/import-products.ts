"use server"

import { revalidateTag } from "next/cache"
import {
  parseImportRows,
  type ParsedLine,
} from "@/features/catalog/products-admin/schema/parse-import"
import {
  MAX_IMPORT_BYTES,
  type ImportReport,
} from "@/features/catalog/products-admin/schema/import-schema"
import { includesExtendedWarranty } from "@/features/shared/lib/catalog/product-rules"
import { PRODUCTS_CACHE_TAG } from "@/features/shared/lib/catalog/product-cache"
import { parseCsv } from "@/features/shared/lib/csv/csv"
import { writeAudit } from "@/features/shared/lib/db/audit"
import { requirePermission } from "@/features/shared/lib/db/permissions"
import { prisma } from "@/features/shared/lib/db/prisma"
import {
  AppError,
  toActionError,
  type ActionResult,
} from "@/features/shared/lib/errors/action-result"
import { getNumberSetting } from "@/features/shared/lib/settings/settings"

/**
 * Imports products from a CSV file (#29, RF48). Valid lines are saved
 * as drafts (publishing checks RN09 separately), each in its own
 * transaction; invalid lines are reported with their line number.
 * Existing products (same slug) are updated; stock of existing SKUs is
 * not changed here.
 *
 * @param formData - The `file` field with the CSV.
 * @returns `{ success: true, report }` or `{ success: false, error }`.
 */
export async function importProducts(
  formData: FormData
): Promise<ActionResult<{ report: ImportReport }>> {
  try {
    const { user } = await requirePermission("product:create")
    const file = formData.get("file")
    if (!(file instanceof File) || file.size === 0) {
      throw new AppError("Escolha um arquivo CSV.", "no_file")
    }
    if (file.size > MAX_IMPORT_BYTES) {
      throw new AppError("O arquivo deve ter no máximo 2 MB.", "too_large")
    }
    const parsed = parseImportRows(parseCsv(await file.text()))
    if ("error" in parsed) throw new AppError(parsed.error, "header")

    const categories = new Map(
      (
        await prisma.category.findMany({ select: { id: true, slug: true } })
      ).map((category) => [category.slug, category.id])
    )
    const threshold = await getNumberSetting(
      "product.extended_warranty_threshold"
    )
    const report: ImportReport = { created: 0, updated: 0, errors: [] }
    const seen = new Map<string, number>()

    for (const line of parsed.lines) {
      if (!line.ok) {
        report.errors.push({ line: line.line, message: line.message })
        continue
      }
      const error = await importLine(line, categories, threshold, user.id, seen)
      if (typeof error === "string") {
        report.errors.push({ line: line.line, message: error })
      } else {
        report[error.created ? "created" : "updated"]++
      }
    }

    if (report.created + report.updated > 0) {
      revalidateTag(PRODUCTS_CACHE_TAG, "max")
    }
    return { success: true, report }
  } catch (error) {
    return toActionError(error, { action: "importProducts" })
  }
}

/**
 * Saves one valid CSV line in its own transaction.
 *
 * @param line - Parsed line.
 * @param categories - Category ids by slug.
 * @param threshold - Extended warranty threshold (RN06).
 * @param userId - User importing.
 * @param seen - SKU codes already used in this file, with their line.
 * @returns `{ created }` or an error message for the report.
 */
async function importLine(
  line: Extract<ParsedLine, { ok: true }>,
  categories: Map<string, string>,
  threshold: number,
  userId: string,
  seen: Map<string, number>
): Promise<{ created: boolean } | string> {
  const categoryId = categories.get(line.categorySlug)
  if (!categoryId)
    return `categoria_slug: categoria "${line.categorySlug}" não existe.`
  const data = line.data
  const sku = data.skus[0]
  const repeated = seen.get(sku.code)
  if (repeated) return `sku: código ${sku.code} repetido (linha ${repeated}).`
  seen.set(sku.code, line.line)
  const slug = data.slug || null
  if (!slug) return "slug: informe o endereço do produto."

  try {
    return await prisma.$transaction(async (tx) => {
      const existing = await tx.product.findUnique({ where: { slug } })
      const owner = await tx.sku.findUnique({
        where: { code: sku.code },
        select: { productId: true },
      })
      if (owner && owner.productId !== existing?.id) {
        throw new AppError(
          `sku: ${sku.code} já pertence a outro produto.`,
          "sku"
        )
      }
      const fields = {
        name: data.name,
        description: data.description,
        brand: data.brand || null,
        categoryId,
        basePrice: data.basePrice,
        weightKg: data.weightKg,
        lengthCm: data.lengthCm,
        widthCm: data.widthCm,
        heightCm: data.heightCm,
        warrantyMonths: data.warrantyMonths,
        leadTimeDays: data.leadTimeDays,
        includesExtendedWarranty: includesExtendedWarranty(
          Number(data.basePrice),
          threshold
        ),
      }
      const product = existing
        ? await tx.product.update({ where: { id: existing.id }, data: fields })
        : await tx.product.create({
            data: { ...fields, slug, status: "DRAFT" },
          })
      if (owner) {
        await tx.sku.update({
          where: { code: sku.code },
          data: { name: sku.name },
        })
      } else {
        const created = await tx.sku.create({
          data: { productId: product.id, code: sku.code, name: sku.name },
        })
        await tx.stock.create({
          data: { skuId: created.id, onHand: sku.stock ?? 0 },
        })
      }
      await writeAudit(tx, {
        userId,
        action: existing ? "product.import.update" : "product.import.create",
        entity: "product",
        entityId: product.id,
        after: { slug, sku: sku.code },
      })
      return { created: !existing }
    })
  } catch (error) {
    if (error instanceof AppError) return error.publicMessage
    return "Não foi possível salvar esta linha."
  }
}
