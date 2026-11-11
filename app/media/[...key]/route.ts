import { NextResponse } from "next/server"
import { readStoredFile } from "@/features/shared/lib/storage/storage"

const CONTENT_TYPES: Record<string, string> = {
  webp: "image/webp",
  pdf: "application/pdf",
}

/**
 * Serves public catalog and home content files (product images,
 * datasheets and carousel images) from the
 * local storage. Only WebP and PDF are served; keys that try to leave
 * the storage folder are refused.
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
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
    },
  })
}
