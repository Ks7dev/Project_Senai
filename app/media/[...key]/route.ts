import { NextResponse } from "next/server"
import { hasPermission } from "@/features/shared/lib/auth/permissions"
import { getCurrentUser } from "@/features/shared/lib/auth/session"
import { loadUserPermissions } from "@/features/shared/lib/db/permissions"
import { prisma } from "@/features/shared/lib/db/prisma"
import { readStoredFile } from "@/features/shared/lib/storage/storage"

const CONTENT_TYPES: Record<string, string> = {
  webp: "image/webp",
  pdf: "application/pdf",
}

/**
 * Serves public catalog and home content files (product images,
 * datasheets and carousel images) from the
 * local storage. Only WebP and PDF are served; keys that try to leave
 * the storage folder are refused. Documents (PDF) of products that are
 * not published are served only to back office users.
 *
 * @param _request - Incoming request.
 * @param context - Route params with the storage key segments.
 * @returns The file or 404.
 */
export async function GET(
  _request: Request,
  context: RouteContext<"/media/[...key]">
) {
  const { key } = await context.params
  const path = key.join("/")
  const extension = path.split(".").pop() ?? ""
  const contentType = CONTENT_TYPES[extension]
  const publicPrefix =
    path.startsWith("products/") || path.startsWith("content/")
  if (!contentType || !publicPrefix) {
    return new NextResponse(null, { status: 404 })
  }

  let cacheControl = "public, max-age=31536000, immutable"
  if (extension === "pdf" && path.startsWith("products/")) {
    cacheControl = "private, max-age=300"
    if (!(await canReadProductDocument(path))) {
      return new NextResponse(null, { status: 404 })
    }
  }

  let data: Buffer | null = null
  try {
    data = await readStoredFile(path)
  } catch {
    data = null
  }
  if (!data) return new NextResponse(null, { status: 404 })

  return new NextResponse(new Uint8Array(data), {
    headers: {
      "Content-Type": contentType,
      "Cache-Control": cacheControl,
      "X-Content-Type-Options": "nosniff",
    },
  })
}

/**
 * Tells whether the request may download a product document: anyone
 * for published products, only back office users with `product:read`
 * otherwise.
 *
 * @param storageKey - Storage key of the document.
 * @returns True when the download is allowed.
 */
async function canReadProductDocument(storageKey: string): Promise<boolean> {
  const document = await prisma.productDocument.findFirst({
    where: { storageKey },
    select: {
      product: {
        select: {
          status: true,
          deletedAt: true,
          category: { select: { active: true } },
        },
      },
    },
  })
  if (!document) return false
  const { status, deletedAt, category } = document.product
  if (status === "ACTIVE" && !deletedAt && category.active) return true
  const user = await getCurrentUser()
  if (!user) return false
  return hasPermission(await loadUserPermissions(user.id), "product:read")
}
