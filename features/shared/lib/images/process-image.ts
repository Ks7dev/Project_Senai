import "server-only"
import sharp from "sharp"
import { AppError } from "@/features/shared/lib/errors/action-result"

/** Widths of the responsive versions generated for each image (RNF04). */
export const IMAGE_WIDTHS = [320, 640, 1024, 1600] as const

/** Maximum size of each final WebP file (RNF04). */
export const MAX_WEBP_BYTES = 300 * 1024

/** Maximum size of the uploaded original. */
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024

const ACCEPTED_FORMATS = new Set(["jpeg", "png", "webp"])

/** One generated WebP version. */
export type ImageVariant = {
  /** Width in pixels. */
  width: number
  /** WebP contents. */
  data: Buffer
}

/**
 * Validates an uploaded image by its real contents (not the file name)
 * and converts it to WebP in every responsive width, each one at most
 * 300 KB (RNF04). Only JPG, PNG and WebP are accepted.
 *
 * @param input - Uploaded file contents.
 * @returns One WebP version per width, never wider than the original.
 * @throws AppError with a user message for invalid or oversized files.
 */
export async function processProductImage(
  input: Buffer
): Promise<ImageVariant[]> {
  if (input.byteLength > MAX_UPLOAD_BYTES) {
    throw new AppError("A imagem deve ter no máximo 10 MB.", "image_too_large")
  }

  let format: string | undefined
  let originalWidth: number | undefined
  try {
    const metadata = await sharp(input).metadata()
    format = metadata.format
    originalWidth = metadata.width
  } catch {
    format = undefined
  }
  if (!format || !ACCEPTED_FORMATS.has(format) || !originalWidth) {
    throw new AppError(
      "Formato não aceito. Envie uma imagem JPG, PNG ou WebP.",
      "image_format"
    )
  }

  const widths = IMAGE_WIDTHS.filter((w) => w <= originalWidth!)
  if (widths.length === 0) widths.push(IMAGE_WIDTHS[0])

  const variants: ImageVariant[] = []
  for (const width of widths) {
    variants.push({ width, data: await toWebpUnderLimit(input, width) })
  }
  return variants
}

/**
 * Encodes a resized WebP, lowering the quality (and, as a last resort,
 * the width) until it fits in MAX_WEBP_BYTES.
 *
 * @param input - Original image.
 * @param width - Target width.
 * @returns WebP contents within the size limit.
 */
async function toWebpUnderLimit(input: Buffer, width: number): Promise<Buffer> {
  let targetWidth = width
  for (let attempt = 0; attempt < 4; attempt++) {
    for (const quality of [82, 72, 62, 52, 42]) {
      const data = await sharp(input)
        .rotate()
        .resize({ width: targetWidth, withoutEnlargement: true })
        .webp({ quality, effort: 4 })
        .toBuffer()
      if (data.byteLength <= MAX_WEBP_BYTES) return data
    }
    targetWidth = Math.round(targetWidth * 0.8)
  }
  throw new AppError(
    "Não foi possível otimizar esta imagem. Tente outra foto.",
    "image_optimize"
  )
}
