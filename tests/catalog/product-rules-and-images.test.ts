import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import sharp from "sharp"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { productFormSchema } from "@/features/catalog/products-admin/schema/product-schema"
import {
  includesExtendedWarranty,
  publishBlocker,
} from "@/features/shared/lib/catalog/product-rules"
import {
  IMAGE_WIDTHS,
  MAX_WEBP_BYTES,
  processProductImage,
} from "@/features/shared/lib/images/process-image"
import {
  readStoredFile,
  resolveStorageKey,
  saveFile,
} from "@/features/shared/lib/storage/storage"

describe("product rules (#21)", () => {
  it("includes the extended warranty only above the threshold (RN06)", () => {
    expect(includesExtendedWarranty(5000.01, 5000)).toBe(true)
    expect(includesExtendedWarranty(5000, 5000)).toBe(false)
  })

  it("blocks publishing without the certification document (RN09)", () => {
    expect(
      publishBlocker({
        requiresCertification: true,
        certificationDocuments: 0,
        activeSkus: 1,
      })
    ).toMatch(/certificação/)
    expect(
      publishBlocker({
        requiresCertification: true,
        certificationDocuments: 1,
        activeSkus: 1,
      })
    ).toBeNull()
  })

  it("blocks publishing without an active SKU", () => {
    expect(
      publishBlocker({
        requiresCertification: false,
        certificationDocuments: 0,
        activeSkus: 0,
      })
    ).toMatch(/SKU/)
  })
})

const validProduct = {
  name: "Luminária de mesa",
  description: "Luminária articulada em latão com LED de 3000 K.",
  categoryId: "0196f5c2-0000-7000-8000-000000000001",
  basePrice: "1.890,00",
  weightKg: "3,2",
  lengthCm: "55",
  widthCm: "20",
  heightCm: "20",
  warrantyMonths: 12,
  leadTimeDays: 5,
  specs: [],
  skus: [{ code: "ilu-art-lat", name: "Latão", stock: 3, active: true }],
}

describe("product form schema (#21)", () => {
  it("accepts Brazilian decimal input and normalizes SKU codes", () => {
    const result = productFormSchema.safeParse(validProduct)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.basePrice).toBe("1890.00")
      expect(result.data.weightKg).toBe("3.2")
      expect(result.data.skus[0].code).toBe("ILU-ART-LAT")
    }
  })

  it("requires weight and every dimension", () => {
    const result = productFormSchema.safeParse({
      ...validProduct,
      weightKg: "",
      heightCm: "0",
    })
    expect(result.success).toBe(false)
    const paths = result.error!.issues.map((issue) => issue.path[0])
    expect(paths).toEqual(expect.arrayContaining(["weightKg", "heightCm"]))
  })

  it("requires at least one SKU", () => {
    expect(
      productFormSchema.safeParse({ ...validProduct, skus: [] }).success
    ).toBe(false)
  })
})

describe("image processing (#22, RNF04)", () => {
  /**
   * Builds a noisy photo-like image, hard to compress.
   *
   * @param width - Width in pixels.
   * @param height - Height in pixels.
   * @returns PNG contents.
   */
  async function noisyPng(width: number, height: number) {
    const raw = Buffer.alloc(width * height * 3)
    for (let i = 0; i < raw.length; i++) raw[i] = (i * 2654435761) % 256
    return sharp(raw, { raw: { width, height, channels: 3 } })
      .png()
      .toBuffer()
  }

  it("converts a large PNG to WebP in every width, each up to 300 KB", async () => {
    const variants = await processProductImage(await noisyPng(2000, 1500))
    expect(variants.map((v) => v.width)).toEqual([...IMAGE_WIDTHS])
    for (const variant of variants) {
      expect(variant.data.byteLength).toBeLessThanOrEqual(MAX_WEBP_BYTES)
      const meta = await sharp(variant.data).metadata()
      expect(meta.format).toBe("webp")
    }
  }, 60_000)

  it("never upscales a small image", async () => {
    const small = await sharp({
      create: { width: 500, height: 400, channels: 3, background: "#ccc" },
    })
      .jpeg()
      .toBuffer()
    const variants = await processProductImage(small)
    expect(variants.map((v) => v.width)).toEqual([320])
  })

  it("refuses files that are not JPG, PNG or WebP, whatever the name", async () => {
    const gif = await sharp({
      create: { width: 10, height: 10, channels: 3, background: "#000" },
    })
      .gif()
      .toBuffer()
    await expect(processProductImage(gif)).rejects.toMatchObject({
      code: "image_format",
    })
    await expect(
      processProductImage(Buffer.from("%PDF-1.7 not an image"))
    ).rejects.toMatchObject({
      publicMessage: "Formato não aceito. Envie uma imagem JPG, PNG ou WebP.",
    })
  })
})

describe("local storage", () => {
  let dir: string
  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), "atelier-storage-"))
    process.env.STORAGE_DIR = dir
  })
  afterAll(async () => {
    delete process.env.STORAGE_DIR
    await rm(dir, { recursive: true, force: true })
  })

  it("saves and reads files by key", async () => {
    await saveFile("products/p1/img-320.webp", Buffer.from("x"))
    expect((await readStoredFile("products/p1/img-320.webp"))?.toString()).toBe(
      "x"
    )
  })

  it("refuses keys that leave the storage folder", () => {
    expect(() => resolveStorageKey("../etc/passwd")).toThrow()
    expect(() => resolveStorageKey("products/../../x")).toThrow()
    expect(() => resolveStorageKey("/absolute")).toThrow()
  })
})
