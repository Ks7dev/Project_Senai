"use server"

import { randomUUID } from "node:crypto"
import { revalidateTag } from "next/cache"
import { z } from "zod"
import {
  documentKindSchema,
  productFormSchema,
  productStatusSchema,
  type ProductFormInput,
  type ProductStatusInput,
} from "@/features/catalog/products-admin/schema/product-schema"
import {
  includesExtendedWarranty,
  publishBlocker,
} from "@/features/shared/lib/catalog/product-rules"
import { PRODUCTS_CACHE_TAG } from "@/features/shared/lib/catalog/product-cache"
import { writeAudit } from "@/features/shared/lib/db/audit"
import { requirePermission } from "@/features/shared/lib/db/permissions"
import { prisma } from "@/features/shared/lib/db/prisma"
import {
  AppError,
  toActionError,
  type ActionResult,
} from "@/features/shared/lib/errors/action-result"
import {
  IMAGE_WIDTHS,
  processProductImage,
} from "@/features/shared/lib/images/process-image"
import { getNumberSetting } from "@/features/shared/lib/settings/settings"
import { deleteFile, saveFile } from "@/features/shared/lib/storage/storage"
import { slugify } from "@/features/shared/lib/text/slug"

const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024
const PDF_MAGIC = Buffer.from("%PDF-")

/** Product row shown in the back office list. */
export type AdminProductRow = {
  id: string
  name: string
  slug: string
  status: "DRAFT" | "ACTIVE" | "INACTIVE"
  basePrice: string
  category: string
  skus: number
}

/** Product with everything the edit form needs. */
export type AdminProductDetail = {
  id: string
  form: ProductFormInput
  status: "DRAFT" | "ACTIVE" | "INACTIVE"
  includesExtendedWarranty: boolean
  images: Array<{ id: string; storageKey: string; alt: string }>
  documents: Array<{
    id: string
    kind: string
    name: string
    storageKey: string
  }>
}

/**
 * Lists products for the back office, with optional search and status.
 *
 * @param input - Search text and status filter.
 * @returns `{ success: true, products }` or `{ success: false, error }`.
 */
export async function listAdminProducts(input: {
  search?: string
  status?: string
}): Promise<ActionResult<{ products: AdminProductRow[] }>> {
  try {
    await requirePermission("product:read")
    const search = input.search?.trim()
    const status = z
      .enum(["DRAFT", "ACTIVE", "INACTIVE"])
      .optional()
      .catch(undefined)
      .parse(input.status || undefined)
    const rows = await prisma.product.findMany({
      where: {
        deletedAt: null,
        ...(status && { status }),
        ...(search && {
          OR: [
            { name: { contains: search } },
            { skus: { some: { code: { contains: search.toUpperCase() } } } },
          ],
        }),
      },
      select: {
        id: true,
        name: true,
        slug: true,
        status: true,
        basePrice: true,
        category: { select: { name: true } },
        _count: { select: { skus: true } },
      },
      orderBy: { updatedAt: "desc" },
      take: 200,
    })
    return {
      success: true,
      products: rows.map((row) => ({
        id: row.id,
        name: row.name,
        slug: row.slug,
        status: row.status,
        basePrice: row.basePrice.toFixed(2),
        category: row.category.name,
        skus: row._count.skus,
      })),
    }
  } catch (error) {
    return toActionError(error, { action: "listAdminProducts" })
  }
}

/**
 * Loads a product for editing.
 *
 * @param id - Product id.
 * @returns `{ success: true, product }` or `{ success: false, error }`.
 */
export async function getAdminProduct(
  id: string
): Promise<ActionResult<{ product: AdminProductDetail }>> {
  try {
    await requirePermission("product:read")
    if (!z.uuid().safeParse(id).success) {
      throw new AppError("Produto não encontrado.", "not_found")
    }
    const product = await prisma.product.findFirst({
      where: { id, deletedAt: null },
      include: {
        skus: { include: { stock: true }, orderBy: { createdAt: "asc" } },
        images: { orderBy: { position: "asc" } },
        documents: { orderBy: { createdAt: "asc" } },
      },
    })
    if (!product) throw new AppError("Produto não encontrado.", "not_found")

    const specs = Object.entries(
      (product.specs ?? {}) as Record<string, string>
    ).map(([label, value]) => ({ label, value }))

    return {
      success: true,
      product: {
        id: product.id,
        status: product.status,
        includesExtendedWarranty: product.includesExtendedWarranty,
        form: {
          id: product.id,
          name: product.name,
          slug: product.slug,
          description: product.description,
          brand: product.brand ?? "",
          categoryId: product.categoryId,
          basePrice: product.basePrice.toFixed(2),
          weightKg: product.weightKg.toFixed(3),
          lengthCm: product.lengthCm.toFixed(2),
          widthCm: product.widthCm.toFixed(2),
          heightCm: product.heightCm.toFixed(2),
          warrantyMonths: product.warrantyMonths,
          leadTimeDays: product.leadTimeDays,
          requiresCertification: product.requiresCertification,
          requiresInstallation: product.requiresInstallation,
          personalizable: product.personalizable,
          limitedEdition: product.limitedEdition,
          lotNumber: product.lotNumber ?? "",
          specs,
          skus: product.skus.map((sku) => ({
            id: sku.id,
            code: sku.code,
            name: sku.name,
            price: sku.price?.toFixed(2) ?? "",
            stock: sku.stock?.onHand ?? 0,
            active: sku.active,
          })),
        },
        images: product.images.map(({ id, storageKey, alt }) => ({
          id,
          storageKey,
          alt,
        })),
        documents: product.documents.map(({ id, kind, name, storageKey }) => ({
          id,
          kind,
          name,
          storageKey,
        })),
      },
    }
  } catch (error) {
    return toActionError(error, { action: "getAdminProduct" })
  }
}

/**
 * Creates or updates a product with its specifications and SKUs (RF41).
 * The extended warranty flag follows the configured threshold (RN06).
 * New SKUs start with the informed stock; stock of existing SKUs is
 * changed only in the stock module (#64). Saved products stay as they
 * are: publishing is a separate step that checks RN09.
 *
 * @param input - Product form values.
 * @returns `{ success: true, id }` or `{ success: false, error }`.
 */
export async function saveProduct(
  input: ProductFormInput
): Promise<ActionResult<{ id: string }>> {
  try {
    const parsed = productFormSchema.safeParse(input)
    if (!parsed.success) {
      throw new AppError("Revise os campos destacados.", "invalid")
    }
    const data = parsed.data
    const { user } = await requirePermission(
      data.id ? "product:update" : "product:create"
    )

    const codes = data.skus.map((sku) => sku.code)
    if (new Set(codes).size !== codes.length) {
      throw new AppError("Há códigos de SKU repetidos.", "duplicate_sku")
    }

    const id = await prisma.$transaction(async (tx) => {
      const threshold = await getNumberSetting(
        "product.extended_warranty_threshold",
        tx
      )
      const slug = data.slug || slugify(data.name)
      const sameSlug = await tx.product.findUnique({ where: { slug } })
      if (sameSlug && sameSlug.id !== data.id) {
        throw new AppError("Já existe um produto com esse endereço.", "slug")
      }
      const skuOwners = await tx.sku.findMany({
        where: { code: { in: codes } },
        select: { code: true, productId: true },
      })
      const taken = skuOwners.find((sku) => sku.productId !== data.id)
      if (taken) {
        throw new AppError(
          `O SKU ${taken.code} já pertence a outro produto.`,
          "sku_taken"
        )
      }

      const fields = {
        name: data.name,
        slug,
        description: data.description,
        brand: data.brand || null,
        categoryId: data.categoryId,
        basePrice: data.basePrice,
        weightKg: data.weightKg,
        lengthCm: data.lengthCm,
        widthCm: data.widthCm,
        heightCm: data.heightCm,
        warrantyMonths: data.warrantyMonths,
        leadTimeDays: data.leadTimeDays,
        requiresCertification: data.requiresCertification,
        requiresInstallation: data.requiresInstallation,
        personalizable: data.personalizable,
        limitedEdition: data.limitedEdition,
        lotNumber: data.lotNumber || null,
        specs: Object.fromEntries(data.specs.map((s) => [s.label, s.value])),
        includesExtendedWarranty: includesExtendedWarranty(
          Number(data.basePrice),
          threshold
        ),
      }

      const before = data.id
        ? await tx.product.findUnique({ where: { id: data.id } })
        : null
      const product = data.id
        ? await tx.product.update({ where: { id: data.id }, data: fields })
        : await tx.product.create({ data: { ...fields, status: "DRAFT" } })

      for (const sku of data.skus) {
        const skuData = {
          code: sku.code,
          name: sku.name,
          price: sku.price || null,
          active: sku.active,
        }
        if (sku.id) {
          await tx.sku.update({
            where: { id: sku.id, productId: product.id },
            data: skuData,
          })
        } else {
          const created = await tx.sku.create({
            data: { ...skuData, productId: product.id },
          })
          await tx.stock.create({
            data: { skuId: created.id, onHand: sku.stock ?? 0 },
          })
          if (sku.stock) {
            await tx.stockMovement.create({
              data: {
                skuId: created.id,
                type: "RESTOCK",
                quantity: sku.stock,
                userId: user.id,
                note: "Estoque inicial no cadastro",
              },
            })
          }
        }
      }

      await writeAudit(tx, {
        userId: user.id,
        action: data.id ? "product.update" : "product.create",
        entity: "product",
        entityId: product.id,
        before,
        after: product,
      })
      return product.id
    })

    revalidateTag(PRODUCTS_CACHE_TAG, "max")
    return { success: true, id }
  } catch (error) {
    return toActionError(error, { action: "saveProduct" })
  }
}

/**
 * Publishes, unpublishes or inactivates a product. Publishing requires
 * the certification document when the product needs one (RN09).
 * Inactive products leave the store but stay in old orders (RF42).
 *
 * @param input - Product id and new status.
 * @returns `{ success: true }` or `{ success: false, error }`.
 */
export async function setProductStatus(
  input: ProductStatusInput
): Promise<ActionResult> {
  try {
    const parsed = productStatusSchema.safeParse(input)
    if (!parsed.success) throw new AppError("Produto inválido.", "invalid")
    const { user } = await requirePermission("product:update")
    const { id, status } = parsed.data

    await prisma.$transaction(async (tx) => {
      const product = await tx.product.findFirst({
        where: { id, deletedAt: null },
        select: {
          status: true,
          requiresCertification: true,
          _count: {
            select: {
              documents: { where: { kind: "CERTIFICATION" } },
              skus: { where: { active: true } },
            },
          },
        },
      })
      if (!product) throw new AppError("Produto não encontrado.", "not_found")
      if (status === "ACTIVE") {
        const blocker = publishBlocker({
          requiresCertification: product.requiresCertification,
          certificationDocuments: product._count.documents,
          activeSkus: product._count.skus,
        })
        if (blocker) throw new AppError(blocker, "cannot_publish")
      }
      await tx.product.update({ where: { id }, data: { status } })
      await writeAudit(tx, {
        userId: user.id,
        action: "product.status",
        entity: "product",
        entityId: id,
        before: { status: product.status },
        after: { status },
      })
    })

    revalidateTag(PRODUCTS_CACHE_TAG, "max")
    return { success: true }
  } catch (error) {
    return toActionError(error, { action: "setProductStatus" })
  }
}

/**
 * Uploads a product image: validates the real format, converts it to
 * WebP in every responsive width up to 300 KB each (RNF04) and stores
 * the versions.
 *
 * @param formData - `productId`, `alt` and the `file`.
 * @returns `{ success: true }` or `{ success: false, error }`.
 */
export async function uploadProductImage(
  formData: FormData
): Promise<ActionResult> {
  try {
    const productId = z.uuid().parse(formData.get("productId"))
    const alt = z
      .string()
      .trim()
      .min(3, "Descreva a imagem (texto alternativo).")
      .max(191)
      .safeParse(formData.get("alt"))
    if (!alt.success) {
      throw new AppError("Descreva a imagem (texto alternativo).", "alt")
    }
    const file = formData.get("file")
    if (!(file instanceof File) || file.size === 0) {
      throw new AppError("Escolha uma imagem.", "no_file")
    }
    const { user } = await requirePermission("product:update")

    const variants = await processProductImage(
      Buffer.from(await file.arrayBuffer())
    )
    const baseKey = `products/${productId}/${randomUUID()}`
    for (const variant of variants) {
      await saveFile(`${baseKey}-${variant.width}.webp`, variant.data)
    }

    await prisma.$transaction(async (tx) => {
      const position = await tx.productImage.count({ where: { productId } })
      const image = await tx.productImage.create({
        data: { productId, storageKey: baseKey, alt: alt.data, position },
      })
      await writeAudit(tx, {
        userId: user.id,
        action: "product.image.create",
        entity: "product",
        entityId: productId,
        after: { imageId: image.id, widths: variants.map((v) => v.width) },
      })
    })

    revalidateTag(PRODUCTS_CACHE_TAG, "max")
    return { success: true }
  } catch (error) {
    return toActionError(error, { action: "uploadProductImage" })
  }
}

/**
 * Removes a product image and its stored versions.
 *
 * @param input - Image id.
 * @returns `{ success: true }` or `{ success: false, error }`.
 */
export async function deleteProductImage(input: {
  id: string
}): Promise<ActionResult> {
  try {
    const id = z.uuid().parse(input.id)
    const { user } = await requirePermission("product:update")
    const image = await prisma.$transaction(async (tx) => {
      const deleted = await tx.productImage.delete({ where: { id } })
      await writeAudit(tx, {
        userId: user.id,
        action: "product.image.delete",
        entity: "product",
        entityId: deleted.productId,
        before: deleted,
      })
      return deleted
    })
    for (const width of IMAGE_WIDTHS) {
      await deleteFile(`${image.storageKey}-${width}.webp`)
    }
    revalidateTag(PRODUCTS_CACHE_TAG, "max")
    return { success: true }
  } catch (error) {
    return toActionError(error, { action: "deleteProductImage" })
  }
}

/**
 * Attaches a PDF document to the product: datasheet (RF03), manual or
 * certification (RN09). The file is checked by its PDF signature.
 *
 * @param formData - `productId`, `kind`, `name` and the PDF `file`.
 * @returns `{ success: true }` or `{ success: false, error }`.
 */
export async function uploadProductDocument(
  formData: FormData
): Promise<ActionResult> {
  try {
    const productId = z.uuid().parse(formData.get("productId"))
    const kind = documentKindSchema.parse(formData.get("kind"))
    const name =
      z.string().trim().min(1).max(191).safeParse(formData.get("name")).data ??
      "Documento"
    const file = formData.get("file")
    if (!(file instanceof File) || file.size === 0) {
      throw new AppError("Escolha um arquivo PDF.", "no_file")
    }
    if (file.size > MAX_DOCUMENT_BYTES) {
      throw new AppError("O PDF deve ter no máximo 10 MB.", "too_large")
    }
    const data = Buffer.from(await file.arrayBuffer())
    if (!data.subarray(0, 5).equals(PDF_MAGIC)) {
      throw new AppError("Envie um arquivo PDF.", "not_pdf")
    }
    const { user } = await requirePermission("product:update")

    const storageKey = `products/${productId}/docs/${randomUUID()}.pdf`
    await saveFile(storageKey, data)
    await prisma.$transaction(async (tx) => {
      const document = await tx.productDocument.create({
        data: { productId, kind, name, storageKey },
      })
      await writeAudit(tx, {
        userId: user.id,
        action: "product.document.create",
        entity: "product",
        entityId: productId,
        after: { documentId: document.id, kind },
      })
    })
    revalidateTag(PRODUCTS_CACHE_TAG, "max")
    return { success: true }
  } catch (error) {
    return toActionError(error, { action: "uploadProductDocument" })
  }
}

/**
 * Removes a product document. Removing the last certification of an
 * active product that requires one moves the product back to draft
 * (RN09).
 *
 * @param input - Document id.
 * @returns `{ success: true }` or `{ success: false, error }`.
 */
export async function deleteProductDocument(input: {
  id: string
}): Promise<ActionResult> {
  try {
    const id = z.uuid().parse(input.id)
    const { user } = await requirePermission("product:update")
    const document = await prisma.$transaction(async (tx) => {
      const deleted = await tx.productDocument.delete({ where: { id } })
      const product = await tx.product.findUniqueOrThrow({
        where: { id: deleted.productId },
        select: {
          status: true,
          requiresCertification: true,
          _count: {
            select: { documents: { where: { kind: "CERTIFICATION" } } },
          },
        },
      })
      if (
        product.status === "ACTIVE" &&
        product.requiresCertification &&
        product._count.documents === 0
      ) {
        await tx.product.update({
          where: { id: deleted.productId },
          data: { status: "DRAFT" },
        })
      }
      await writeAudit(tx, {
        userId: user.id,
        action: "product.document.delete",
        entity: "product",
        entityId: deleted.productId,
        before: deleted,
      })
      return deleted
    })
    await deleteFile(document.storageKey)
    revalidateTag(PRODUCTS_CACHE_TAG, "max")
    return { success: true }
  } catch (error) {
    return toActionError(error, { action: "deleteProductDocument" })
  }
}
