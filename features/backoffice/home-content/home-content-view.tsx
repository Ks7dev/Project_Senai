"use client"

import { useState, useTransition } from "react"
import { ArrowDownIcon, ArrowUpIcon, PlusIcon, Trash2Icon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { FormField } from "@/components/ui/form-field"
import { Input } from "@/components/ui/input"
import {
  saveHomeContent,
  uploadHomeImage,
} from "@/features/backoffice/home-content/action/home-content-actions"
import type {
  HomeContent,
  HomeSlide,
} from "@/features/shared/lib/content/home-content"

/**
 * Moves an item one position up or down in a list.
 *
 * @param list - Items.
 * @param index - Item to move.
 * @param delta - -1 (up) or 1 (down).
 * @returns The reordered list.
 */
function move<T>(list: T[], index: number, delta: number): T[] {
  const target = index + delta
  if (target < 0 || target >= list.length) return list
  const next = [...list]
  ;[next[index], next[target]] = [next[target], next[index]]
  return next
}

/**
 * Back office home editor (#30, RF47): carousel slides (texts, link,
 * image and order) and product showcases. Saving updates the home
 * without a deploy.
 *
 * @param props - Current home content.
 * @returns The editor.
 */
export function HomeContentView({ content }: { content: HomeContent }) {
  const [draft, setDraft] = useState<HomeContent>(content)
  const [error, setError] = useState<string>()
  const [message, setMessage] = useState<string>()
  const [pending, startTransition] = useTransition()

  const updateSlide = (index: number, patch: Partial<HomeSlide>) =>
    setDraft({
      ...draft,
      slides: draft.slides.map((slide, i) =>
        i === index ? { ...slide, ...patch } : slide
      ),
    })

  const upload = (index: number, file: File) =>
    startTransition(async () => {
      setError(undefined)
      const formData = new FormData()
      formData.set("file", file)
      const result = await uploadHomeImage(formData)
      if (!result.success) return setError(result.error)
      updateSlide(index, { imageKey: result.imageKey })
    })

  const save = () =>
    startTransition(async () => {
      setError(undefined)
      setMessage(undefined)
      const result = await saveHomeContent(draft)
      if (!result.success) return setError(result.error)
      setMessage("Home atualizada. As mudanças já aparecem na loja.")
    })

  return (
    <div className="flex flex-col gap-xl">
      <section aria-labelledby="slides" className="flex flex-col gap-md">
        <h2 id="slides" className="text-headline-md">
          Carrossel
        </h2>
        {draft.slides.map((slide, index) => (
          <fieldset
            key={slide.id}
            className="grid gap-md rounded-lg border border-line-subtle bg-elevated p-md md:grid-cols-2"
          >
            <legend className="px-xs text-label font-medium">
              Slide {index + 1}
            </legend>
            <FormField id={`slide-title-${index}`} label="Título">
              <Input
                id={`slide-title-${index}`}
                value={slide.title}
                onChange={(e) => updateSlide(index, { title: e.target.value })}
              />
            </FormField>
            <FormField id={`slide-eyebrow-${index}`} label="Chamada curta">
              <Input
                id={`slide-eyebrow-${index}`}
                value={slide.eyebrow ?? ""}
                onChange={(e) =>
                  updateSlide(index, { eyebrow: e.target.value })
                }
              />
            </FormField>
            <FormField
              id={`slide-subtitle-${index}`}
              label="Texto"
              className="md:col-span-2"
            >
              <Input
                id={`slide-subtitle-${index}`}
                value={slide.subtitle ?? ""}
                onChange={(e) =>
                  updateSlide(index, { subtitle: e.target.value })
                }
              />
            </FormField>
            <FormField id={`slide-cta-${index}`} label="Texto do botão">
              <Input
                id={`slide-cta-${index}`}
                value={slide.ctaLabel ?? ""}
                onChange={(e) =>
                  updateSlide(index, { ctaLabel: e.target.value })
                }
              />
            </FormField>
            <FormField
              id={`slide-href-${index}`}
              label="Link do botão"
              hint="Link interno, ex.: /categoria/iluminacao"
            >
              <Input
                id={`slide-href-${index}`}
                value={slide.ctaHref ?? ""}
                onChange={(e) =>
                  updateSlide(index, { ctaHref: e.target.value })
                }
              />
            </FormField>
            <FormField
              id={`slide-image-${index}`}
              label="Imagem (JPG, PNG ou WebP)"
            >
              <input
                id={`slide-image-${index}`}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="text-body-sm"
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) upload(index, file)
                }}
              />
            </FormField>
            <FormField
              id={`slide-alt-${index}`}
              label="Texto alternativo da imagem"
            >
              <Input
                id={`slide-alt-${index}`}
                value={slide.imageAlt ?? ""}
                onChange={(e) =>
                  updateSlide(index, { imageAlt: e.target.value })
                }
              />
            </FormField>
            {slide.imageKey && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={`/media/${slide.imageKey}-320.webp`}
                alt={slide.imageAlt ?? ""}
                className="h-24 w-40 rounded object-cover"
              />
            )}
            <div className="flex gap-xs md:col-span-2">
              <Button
                type="button"
                size="icon-sm"
                variant="ghost"
                aria-label={`Subir slide ${index + 1}`}
                onClick={() =>
                  setDraft({ ...draft, slides: move(draft.slides, index, -1) })
                }
              >
                <ArrowUpIcon />
              </Button>
              <Button
                type="button"
                size="icon-sm"
                variant="ghost"
                aria-label={`Descer slide ${index + 1}`}
                onClick={() =>
                  setDraft({ ...draft, slides: move(draft.slides, index, 1) })
                }
              >
                <ArrowDownIcon />
              </Button>
              <Button
                type="button"
                size="icon-sm"
                variant="ghost"
                aria-label={`Remover slide ${index + 1}`}
                onClick={() =>
                  setDraft({
                    ...draft,
                    slides: draft.slides.filter((_, i) => i !== index),
                  })
                }
              >
                <Trash2Icon />
              </Button>
            </div>
          </fieldset>
        ))}
        <Button
          type="button"
          variant="ghost"
          className="self-start"
          disabled={draft.slides.length >= 6}
          onClick={() =>
            setDraft({
              ...draft,
              slides: [
                ...draft.slides,
                { id: crypto.randomUUID(), title: "Novo destaque" },
              ],
            })
          }
        >
          <PlusIcon /> Adicionar slide
        </Button>
      </section>

      <section aria-labelledby="vitrines" className="flex flex-col gap-md">
        <h2 id="vitrines" className="text-headline-md">
          Vitrines de produtos
        </h2>
        {draft.showcases.map((showcase, index) => (
          <fieldset
            key={showcase.id}
            className="grid gap-md rounded-lg border border-line-subtle bg-elevated p-md"
          >
            <legend className="px-xs text-label font-medium">
              Vitrine {index + 1}
            </legend>
            <FormField id={`showcase-title-${index}`} label="Título">
              <Input
                id={`showcase-title-${index}`}
                value={showcase.title}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    showcases: draft.showcases.map((s, i) =>
                      i === index ? { ...s, title: e.target.value } : s
                    ),
                  })
                }
              />
            </FormField>
            <FormField
              id={`showcase-products-${index}`}
              label="Produtos (slugs separados por vírgula, na ordem de exibição)"
              hint="Produtos não publicados são ignorados na loja."
            >
              <Input
                id={`showcase-products-${index}`}
                value={showcase.productSlugs.join(", ")}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    showcases: draft.showcases.map((s, i) =>
                      i === index
                        ? {
                            ...s,
                            productSlugs: e.target.value
                              .split(",")
                              .map((slug) => slug.trim())
                              .filter(Boolean),
                          }
                        : s
                    ),
                  })
                }
              />
            </FormField>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="self-start"
              onClick={() =>
                setDraft({
                  ...draft,
                  showcases: draft.showcases.filter((_, i) => i !== index),
                })
              }
            >
              Remover vitrine
            </Button>
          </fieldset>
        ))}
        <Button
          type="button"
          variant="ghost"
          className="self-start"
          disabled={draft.showcases.length >= 4}
          onClick={() =>
            setDraft({
              ...draft,
              showcases: [
                ...draft.showcases,
                {
                  id: crypto.randomUUID(),
                  title: "Nova vitrine",
                  productSlugs: [],
                },
              ],
            })
          }
        >
          <PlusIcon /> Adicionar vitrine
        </Button>
      </section>

      {error && (
        <p
          role="alert"
          className="rounded bg-error-tint p-sm text-body-sm text-error"
        >
          {error}
        </p>
      )}
      {message && (
        <p role="status" className="text-body-sm text-success">
          {message}
        </p>
      )}
      <Button className="self-start" disabled={pending} onClick={save}>
        {pending ? "Salvando…" : "Publicar alterações"}
      </Button>
    </div>
  )
}
