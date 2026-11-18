import { mkdir, readFile, writeFile } from "node:fs/promises"
import { dirname, join } from "node:path"
import sharp from "sharp"
import type { PrismaClient } from "../generated/prisma/client"
import {
  DEFAULT_HOME_CONTENT,
  HOME_CONTENT_KEY,
  parseHomeContent,
} from "../features/shared/lib/content/home-content"

/** Folder with the demo illustrations (`npm run media:generate`). */
const MEDIA_DIR = join(process.cwd(), "prisma", "seed-media")

// Same widths and size limit as features/shared/lib/images/process-image.ts
// (not imported: that module is "server-only" and the seed runs outside Next)
const WIDTHS = [320, 640, 1024, 1600]
const MAX_BYTES = 300 * 1024

/** An illustration of a seeded product, with its alternative text. */
type ProductMedia = { slug: string; alts: [string, string] }

/** Illustrations of the seeded products: overview and close-up (RF41). */
const PRODUCT_MEDIA: ProductMedia[] = [
  {
    slug: "caderno-couro-toscano-a5",
    alts: [
      "Ilustração do caderno em couro toscano caramelo, com costura aparente na lombada, fita marcadora vinho e elástico grafite",
      "Detalhe da costura aparente, do relevo e da fita marcadora do caderno em couro toscano",
    ],
  },
  {
    slug: "caneta-tinteiro-heritage",
    alts: [
      "Ilustração da caneta tinteiro Heritage, em resina verde com detalhes em latão, sobre uma folha pautada",
      "Detalhe da pena de aço banhada a ouro da caneta tinteiro Heritage",
    ],
  },
  {
    slug: "organizador-modular-nogueira",
    alts: [
      "Ilustração do organizador modular em nogueira, visto de cima, com compartimentos, bloco de notas e canetas",
      "Detalhe dos compartimentos e do friso em latão escovado do organizador em nogueira",
    ],
  },
  {
    slug: "luminaria-articulada-latao",
    alts: [
      "Ilustração da luminária articulada em latão, com braço duplo e feixe de luz quente sobre a mesa",
      "Detalhe da cúpula e da articulação em latão escovado da luminária",
    ],
  },
  {
    slug: "poltrona-executiva-walnut",
    alts: [
      "Ilustração da poltrona executiva em couro conhaque, com braços e pés em nogueira",
      "Detalhe do braço em nogueira e da costura do couro da poltrona executiva",
    ],
  },
  {
    slug: "mesa-regulavel-carvalho",
    alts: [
      "Ilustração da mesa com regulagem elétrica de altura, tampo em carvalho, com notebook e indicação da faixa de altura",
      "Detalhe do painel de memória de quatro posições e da coluna telescópica da mesa",
    ],
  },
]

/** Alternative text of the illustrations of the home slides. */
const SLIDE_MEDIA = [
  {
    id: "slide-1",
    file: "slide-1.webp",
    key: "content/home/seed-slide-1",
    alt: "Ilustração de uma escrivaninha em madeira com livros, caderno em couro, caneta tinteiro e luminária de latão acesa",
  },
  {
    id: "slide-2",
    file: "slide-2.webp",
    key: "content/home/seed-slide-2",
    alt: "Ilustração de um escritório corporativo com mesa regulável em carvalho e poltrona executiva em couro",
  },
]

/**
 * Writes every responsive WebP width of an illustration to the storage,
 * keeping each file within the size limit (RNF04).
 *
 * @param key - Storage key without width and extension.
 * @param file - Path of the source illustration.
 */
async function saveVariants(key: string, file: string): Promise<void> {
  const root =
    process.env.STORAGE_DIR || join(process.cwd(), "storage", "uploads")
  const source = await readFile(file)
  for (const width of WIDTHS) {
    let data = Buffer.alloc(0)
    for (const quality of [82, 72, 62, 52, 42]) {
      data = await sharp(source)
        .resize({ width, withoutEnlargement: true })
        .webp({ quality, effort: 4 })
        .toBuffer()
      if (data.byteLength <= MAX_BYTES) break
    }
    const path = join(root, `${key}-${width}.webp`)
    await mkdir(dirname(path), { recursive: true })
    await writeFile(path, data)
  }
}

/**
 * Seeds the demo illustrations: two images for each seeded product and the
 * images of the default home slides. Idempotent and non-destructive:
 * products that already have images, and slides that already have an
 * image, are left as the back office set them.
 *
 * @param prisma - Prisma client.
 */
export async function seedMedia(prisma: PrismaClient): Promise<void> {
  for (const media of PRODUCT_MEDIA) {
    const product = await prisma.product.findUnique({
      where: { slug: media.slug },
      select: { id: true, _count: { select: { images: true } } },
    })
    if (!product || product._count.images > 0) continue
    for (const [index, alt] of media.alts.entries()) {
      const key = `products/${product.id}/seed-${index + 1}`
      await saveVariants(
        key,
        join(MEDIA_DIR, "products", media.slug, `${index + 1}.webp`)
      )
      await prisma.productImage.create({
        data: { productId: product.id, storageKey: key, alt, position: index },
      })
    }
  }

  const stored = await prisma.setting.findUnique({
    where: { key: HOME_CONTENT_KEY },
  })
  const content = stored ? parseHomeContent(stored.value) : DEFAULT_HOME_CONTENT
  let changed = !stored
  const slides = content.slides.map((slide) => {
    const media = SLIDE_MEDIA.find((item) => item.id === slide.id)
    if (!media || slide.imageKey) return slide
    changed = true
    return { ...slide, imageKey: media.key, imageAlt: media.alt }
  })
  if (!changed) return

  for (const media of SLIDE_MEDIA) {
    if (!slides.some((slide) => slide.imageKey === media.key)) continue
    await saveVariants(media.key, join(MEDIA_DIR, "content", media.file))
  }
  const value = { ...content, slides }
  await prisma.setting.upsert({
    where: { key: HOME_CONTENT_KEY },
    create: {
      key: HOME_CONTENT_KEY,
      value,
      description: "Carrossel e vitrines da home (RF47)",
    },
    update: { value },
  })
}
