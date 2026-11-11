"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { zodResolver } from "@hookform/resolvers/zod"
import { PlusIcon, Trash2Icon } from "lucide-react"
import { useFieldArray, useForm } from "react-hook-form"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { FormField, fieldAria } from "@/components/ui/form-field"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  deleteProductDocument,
  deleteProductImage,
  saveProduct,
  setProductStatus,
  uploadProductDocument,
  uploadProductImage,
  type AdminProductDetail,
} from "@/features/catalog/products-admin/action/product-actions"
import {
  productFormSchema,
  type ProductFormData,
  type ProductFormInput,
} from "@/features/catalog/products-admin/schema/product-schema"

type ProductFormViewProps = {
  /** Category select options. */
  categories: Array<{ id: string; label: string }>
  /** Product being edited; undefined when creating. */
  product?: AdminProductDetail
}

const emptyProduct: ProductFormInput = {
  name: "",
  slug: "",
  description: "",
  brand: "",
  categoryId: "",
  basePrice: "",
  weightKg: "",
  lengthCm: "",
  widthCm: "",
  heightCm: "",
  warrantyMonths: 3,
  leadTimeDays: 5,
  requiresCertification: false,
  requiresInstallation: false,
  personalizable: false,
  limitedEdition: false,
  lotNumber: "",
  specs: [],
  skus: [{ code: "", name: "Padrão", price: "", stock: 0, active: true }],
}

const STATUS_LABEL = {
  DRAFT: "Rascunho",
  ACTIVE: "Publicado",
  INACTIVE: "Inativo",
} as const

/**
 * Back office product form (#21): data, specifications, SKUs,
 * images (#22), documents and publishing (RN09).
 *
 * @param props - Category options and the product being edited.
 * @returns The form.
 */
export function ProductFormView({ categories, product }: ProductFormViewProps) {
  const router = useRouter()
  const [message, setMessage] = useState<string>()
  const [error, setError] = useState<string>()
  const [pending, startTransition] = useTransition()
  const form = useForm<ProductFormInput, unknown, ProductFormData>({
    resolver: zodResolver(productFormSchema),
    defaultValues: product?.form ?? emptyProduct,
  })
  const specs = useFieldArray({ control: form.control, name: "specs" })
  const skus = useFieldArray({ control: form.control, name: "skus" })
  const errors = form.formState.errors

  const run = (
    action: () => Promise<{ success: boolean; error?: string }>,
    success?: string
  ) =>
    startTransition(async () => {
      setError(undefined)
      setMessage(undefined)
      const result = await action()
      if (!result.success) return setError(result.error)
      if (success) setMessage(success)
      router.refresh()
    })

  const onSubmit = form.handleSubmit((values) =>
    startTransition(async () => {
      setError(undefined)
      setMessage(undefined)
      const result = await saveProduct(values as ProductFormInput)
      if (!result.success) return setError(result.error)
      if (!product) return router.push(`/admin/produtos/${result.id}`)
      setMessage("Produto salvo.")
      router.refresh()
    })
  )

  const text = (
    name: keyof ProductFormInput,
    label: string,
    options: { hint?: string; inputMode?: "decimal" | "numeric" } = {}
  ) => {
    const message = errors[name]?.message as string | undefined
    return (
      <FormField
        id={`product-${name}`}
        label={label}
        error={message}
        hint={options.hint}
      >
        <Input
          id={`product-${name}`}
          inputMode={options.inputMode}
          {...fieldAria(`product-${name}`, message)}
          {...form.register(name)}
        />
      </FormField>
    )
  }

  const flag = (name: keyof ProductFormInput, label: string) => (
    <Label className="flex items-center gap-sm">
      <Checkbox
        defaultChecked={Boolean(form.getValues(name))}
        onCheckedChange={(checked) =>
          form.setValue(name, (checked === true) as never)
        }
      />
      {label}
    </Label>
  )

  return (
    <div className="flex flex-col gap-xl">
      {product && (
        <section
          aria-labelledby="publicacao"
          className="flex flex-wrap items-center gap-md rounded-lg border border-line-subtle bg-subtle p-md"
        >
          <h2 id="publicacao" className="text-headline-sm">
            Publicação
          </h2>
          <Badge variant={product.status === "ACTIVE" ? "default" : "outline"}>
            {STATUS_LABEL[product.status]}
          </Badge>
          {product.includesExtendedWarranty && (
            <Badge variant="secondary">Garantia estendida incluída</Badge>
          )}
          <div className="ml-auto flex flex-wrap gap-sm">
            {product.status !== "ACTIVE" && (
              <Button
                disabled={pending}
                onClick={() =>
                  run(
                    () =>
                      setProductStatus({ id: product.id, status: "ACTIVE" }),
                    "Produto publicado."
                  )
                }
              >
                Publicar
              </Button>
            )}
            {product.status === "ACTIVE" && (
              <Button
                variant="ghost"
                disabled={pending}
                onClick={() =>
                  run(
                    () => setProductStatus({ id: product.id, status: "DRAFT" }),
                    "Produto despublicado."
                  )
                }
              >
                Despublicar
              </Button>
            )}
            {product.status !== "INACTIVE" && (
              <Button
                variant="ghost"
                disabled={pending}
                onClick={() =>
                  run(
                    () =>
                      setProductStatus({ id: product.id, status: "INACTIVE" }),
                    "Produto inativado: saiu da vitrine e da busca."
                  )
                }
              >
                Inativar
              </Button>
            )}
          </div>
        </section>
      )}

      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-lg">
        <section aria-labelledby="dados" className="flex flex-col gap-md">
          <h2 id="dados" className="text-headline-md">
            Dados do produto
          </h2>
          <div className="grid gap-md md:grid-cols-2">
            {text("name", "Nome")}
            {text("slug", "Endereço (slug)", {
              hint: "Em branco: gerado a partir do nome.",
            })}
            <FormField
              id="product-categoryId"
              label="Categoria"
              error={errors.categoryId?.message}
            >
              <select
                id="product-categoryId"
                className="h-11 rounded border border-line bg-canvas px-md text-body"
                {...fieldAria("product-categoryId", errors.categoryId?.message)}
                {...form.register("categoryId")}
              >
                <option value="">Escolha…</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>
            </FormField>
            {text("brand", "Marca")}
            {text("basePrice", "Preço (R$)", { inputMode: "decimal" })}
            {text("warrantyMonths", "Garantia contratual (meses)", {
              inputMode: "numeric",
            })}
            {text("leadTimeDays", "Prazo de produção/separação (dias)", {
              inputMode: "numeric",
            })}
            {text("lotNumber", "Numeração do lote")}
          </div>
          <FormField
            id="product-description"
            label="Descrição"
            error={errors.description?.message}
          >
            <textarea
              id="product-description"
              rows={5}
              className="rounded border border-line bg-canvas p-md text-body"
              {...fieldAria("product-description", errors.description?.message)}
              {...form.register("description")}
            />
          </FormField>
        </section>

        <section aria-labelledby="frete" className="flex flex-col gap-md">
          <h2 id="frete" className="text-headline-md">
            Peso e dimensões da embalagem
          </h2>
          <p className="text-body-sm text-ink-muted">
            Obrigatórios: são usados no cálculo do frete.
          </p>
          <div className="grid gap-md md:grid-cols-4">
            {text("weightKg", "Peso (kg)", { inputMode: "decimal" })}
            {text("lengthCm", "Comprimento (cm)", { inputMode: "decimal" })}
            {text("widthCm", "Largura (cm)", { inputMode: "decimal" })}
            {text("heightCm", "Altura (cm)", { inputMode: "decimal" })}
          </div>
        </section>

        <section aria-labelledby="regras" className="flex flex-col gap-sm">
          <h2 id="regras" className="text-headline-md">
            Características
          </h2>
          {flag(
            "requiresCertification",
            "Exige certificação (NR, INMETRO) para publicar"
          )}
          {flag("requiresInstallation", "Exige agendamento de instalação")}
          {flag("personalizable", "Aceita personalização (gravação)")}
          {flag("limitedEdition", "Edição limitada")}
        </section>

        <section aria-labelledby="specs" className="flex flex-col gap-md">
          <h2 id="specs" className="text-headline-md">
            Especificações técnicas
          </h2>
          {specs.fields.map((field, index) => (
            <div key={field.id} className="flex flex-wrap items-end gap-sm">
              <FormField
                id={`spec-label-${index}`}
                label="Especificação"
                className="flex-1"
              >
                <Input
                  id={`spec-label-${index}`}
                  {...form.register(`specs.${index}.label`)}
                />
              </FormField>
              <FormField
                id={`spec-value-${index}`}
                label="Valor"
                className="flex-1"
              >
                <Input
                  id={`spec-value-${index}`}
                  {...form.register(`specs.${index}.value`)}
                />
              </FormField>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                aria-label={`Remover especificação ${index + 1}`}
                onClick={() => specs.remove(index)}
              >
                <Trash2Icon />
              </Button>
            </div>
          ))}
          <Button
            type="button"
            variant="ghost"
            className="self-start"
            onClick={() => specs.append({ label: "", value: "" })}
          >
            <PlusIcon /> Adicionar especificação
          </Button>
        </section>

        <section aria-labelledby="skus" className="flex flex-col gap-md">
          <h2 id="skus" className="text-headline-md">
            Variações (SKUs)
          </h2>
          {errors.skus?.message && (
            <p role="alert" className="text-body-sm text-error">
              {errors.skus.message}
            </p>
          )}
          {skus.fields.map((field, index) => {
            const skuErrors = errors.skus?.[index]
            const isNew = !form.getValues(`skus.${index}.id`)
            return (
              <div
                key={field.id}
                className="grid items-end gap-sm rounded border border-line-subtle p-sm md:grid-cols-[1fr_1fr_8rem_8rem_auto]"
              >
                <FormField
                  id={`sku-code-${index}`}
                  label="Código"
                  error={skuErrors?.code?.message}
                >
                  <Input
                    id={`sku-code-${index}`}
                    {...form.register(`skus.${index}.code`)}
                  />
                </FormField>
                <FormField
                  id={`sku-name-${index}`}
                  label="Nome"
                  error={skuErrors?.name?.message}
                >
                  <Input
                    id={`sku-name-${index}`}
                    {...form.register(`skus.${index}.name`)}
                  />
                </FormField>
                <FormField
                  id={`sku-price-${index}`}
                  label="Preço próprio"
                  error={skuErrors?.price?.message}
                >
                  <Input
                    id={`sku-price-${index}`}
                    inputMode="decimal"
                    placeholder="Usa o do produto"
                    {...form.register(`skus.${index}.price`)}
                  />
                </FormField>
                <FormField
                  id={`sku-stock-${index}`}
                  label={isNew ? "Estoque inicial" : "Estoque"}
                  hint={isNew ? undefined : "Altere no módulo Estoque."}
                >
                  <Input
                    id={`sku-stock-${index}`}
                    inputMode="numeric"
                    disabled={!isNew}
                    {...form.register(`skus.${index}.stock`)}
                  />
                </FormField>
                {isNew ? (
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    aria-label={`Remover variação ${index + 1}`}
                    onClick={() => skus.remove(index)}
                  >
                    <Trash2Icon />
                  </Button>
                ) : (
                  <Label className="flex items-center gap-xs text-body-sm">
                    <Checkbox
                      defaultChecked={form.getValues(`skus.${index}.active`)}
                      onCheckedChange={(checked) =>
                        form.setValue(`skus.${index}.active`, checked === true)
                      }
                    />
                    Ativa
                  </Label>
                )}
              </div>
            )
          })}
          <Button
            type="button"
            variant="ghost"
            className="self-start"
            onClick={() =>
              skus.append({
                code: "",
                name: "",
                price: "",
                stock: 0,
                active: true,
              })
            }
          >
            <PlusIcon /> Adicionar variação
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
        <Button type="submit" disabled={pending} className="self-start">
          {pending ? "Salvando…" : product ? "Salvar produto" : "Criar produto"}
        </Button>
      </form>

      {product && (
        <ProductMedia product={product} pending={pending} run={run} />
      )}
    </div>
  )
}

type ProductMediaProps = {
  product: AdminProductDetail
  pending: boolean
  run: (
    action: () => Promise<{ success: boolean; error?: string }>,
    success?: string
  ) => void
}

/**
 * Image and document uploads of an existing product (#22, RN09).
 *
 * @param props - Product, pending state and the action runner.
 * @returns The media sections.
 */
function ProductMedia({ product, pending, run }: ProductMediaProps) {
  return (
    <div className="grid gap-xl lg:grid-cols-2">
      <section aria-labelledby="imagens" className="flex flex-col gap-md">
        <h2 id="imagens" className="text-headline-md">
          Imagens
        </h2>
        <p className="text-body-sm text-ink-muted">
          JPG, PNG ou WebP até 10 MB. Convertidas para WebP em 4 tamanhos, cada
          um com até 300 KB.
        </p>
        <ul className="grid grid-cols-2 gap-sm md:grid-cols-3">
          {product.images.map((image) => (
            <li key={image.id} className="flex flex-col gap-xs">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`/media/${image.storageKey}-320.webp`}
                alt={image.alt}
                className="aspect-square w-full rounded-lg bg-subtle object-cover"
              />
              <Button
                size="sm"
                variant="ghost"
                disabled={pending}
                onClick={() =>
                  run(
                    () => deleteProductImage({ id: image.id }),
                    "Imagem removida."
                  )
                }
              >
                Remover
              </Button>
            </li>
          ))}
        </ul>
        <form
          className="flex flex-col gap-sm"
          action={(formData) =>
            run(() => uploadProductImage(formData), "Imagem enviada.")
          }
        >
          <input type="hidden" name="productId" value={product.id} />
          <FormField id="image-file" label="Arquivo da imagem">
            <input
              id="image-file"
              name="file"
              type="file"
              required
              accept="image/jpeg,image/png,image/webp"
              className="text-body-sm"
            />
          </FormField>
          <FormField
            id="image-alt"
            label="Texto alternativo"
            hint="Descreva a imagem para leitores de tela."
          >
            <Input id="image-alt" name="alt" required />
          </FormField>
          <Button type="submit" variant="ghost" disabled={pending}>
            Enviar imagem
          </Button>
        </form>
      </section>

      <section aria-labelledby="documentos" className="flex flex-col gap-md">
        <h2 id="documentos" className="text-headline-md">
          Documentos (PDF)
        </h2>
        <ul className="flex flex-col gap-xs">
          {product.documents.map((document) => (
            <li
              key={document.id}
              className="flex items-center gap-sm text-body-sm"
            >
              <Badge variant="outline">{document.kind}</Badge>
              <a
                href={`/media/${document.storageKey}`}
                className="flex-1 text-primary underline"
              >
                {document.name}
              </a>
              <Button
                size="sm"
                variant="ghost"
                disabled={pending}
                onClick={() =>
                  run(
                    () => deleteProductDocument({ id: document.id }),
                    "Documento removido."
                  )
                }
              >
                Remover
              </Button>
            </li>
          ))}
        </ul>
        <form
          className="flex flex-col gap-sm"
          action={(formData) =>
            run(() => uploadProductDocument(formData), "Documento enviado.")
          }
        >
          <input type="hidden" name="productId" value={product.id} />
          <FormField id="doc-kind" label="Tipo">
            <select
              id="doc-kind"
              name="kind"
              className="h-11 rounded border border-line bg-canvas px-md text-body"
            >
              <option value="DATASHEET">Ficha técnica</option>
              <option value="CERTIFICATION">Certificação</option>
              <option value="MANUAL">Manual</option>
            </select>
          </FormField>
          <FormField id="doc-name" label="Nome do documento">
            <Input id="doc-name" name="name" required />
          </FormField>
          <FormField id="doc-file" label="Arquivo PDF (até 10 MB)">
            <input
              id="doc-file"
              name="file"
              type="file"
              required
              accept="application/pdf"
              className="text-body-sm"
            />
          </FormField>
          <Button type="submit" variant="ghost" disabled={pending}>
            Enviar documento
          </Button>
        </form>
      </section>
    </div>
  )
}
