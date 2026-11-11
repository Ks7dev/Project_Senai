"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { ArrowDownIcon, ArrowUpIcon, PencilIcon } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { FormField } from "@/components/ui/form-field"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  moveCategory,
  saveCategory,
  toggleCategory,
} from "@/features/catalog/categories/action/category-actions"
import {
  buildCategoryTree,
  type CategoryNode,
  type CategoryRow,
} from "@/features/shared/lib/catalog/category-tree"

type CategoriesViewProps = {
  /** Every category, active or not. */
  categories: CategoryRow[]
}

type Draft = {
  id?: string
  name: string
  slug: string
  parentId: string
  active: boolean
}

const emptyDraft: Draft = { name: "", slug: "", parentId: "", active: true }

/**
 * Back office category manager (#23, RF01): tree with reorder buttons,
 * create/edit form and show/hide toggle.
 *
 * @param props - Categories from the server.
 * @returns The manager.
 */
export function CategoriesView({ categories }: CategoriesViewProps) {
  const router = useRouter()
  const [draft, setDraft] = useState<Draft>(emptyDraft)
  const [error, setError] = useState<string>()
  const [pending, startTransition] = useTransition()
  const tree = buildCategoryTree(categories)

  const run = (action: () => Promise<{ success: boolean; error?: string }>) =>
    startTransition(async () => {
      setError(undefined)
      const result = await action()
      if (!result.success) return setError(result.error)
      router.refresh()
    })

  const onSubmit = (event: React.FormEvent) => {
    event.preventDefault()
    run(async () => {
      const result = await saveCategory(draft)
      if (result.success) setDraft(emptyDraft)
      return result
    })
  }

  const renderNode = (node: CategoryNode, depth: number) => (
    <li key={node.id} className="flex flex-col">
      <div
        className="flex flex-wrap items-center gap-sm border-b border-line-subtle py-sm"
        style={{ paddingLeft: `${depth * 1.5}rem` }}
      >
        <span className="flex-1 text-body text-ink">{node.name}</span>
        <span className="text-body-sm text-ink-muted">/{node.slug}</span>
        {!node.active && <Badge variant="outline">Oculta</Badge>}
        <Button
          size="icon-sm"
          variant="ghost"
          aria-label={`Subir ${node.name}`}
          disabled={pending}
          onClick={() =>
            run(() => moveCategory({ id: node.id, direction: "up" }))
          }
        >
          <ArrowUpIcon />
        </Button>
        <Button
          size="icon-sm"
          variant="ghost"
          aria-label={`Descer ${node.name}`}
          disabled={pending}
          onClick={() =>
            run(() => moveCategory({ id: node.id, direction: "down" }))
          }
        >
          <ArrowDownIcon />
        </Button>
        <Button
          size="icon-sm"
          variant="ghost"
          aria-label={`Editar ${node.name}`}
          onClick={() =>
            setDraft({
              id: node.id,
              name: node.name,
              slug: node.slug,
              parentId: node.parentId ?? "",
              active: node.active,
            })
          }
        >
          <PencilIcon />
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={pending}
          onClick={() =>
            run(() => toggleCategory({ id: node.id, active: !node.active }))
          }
        >
          {node.active ? "Ocultar" : "Mostrar"}
        </Button>
      </div>
      {node.children.length > 0 && (
        <ul>{node.children.map((child) => renderNode(child, depth + 1))}</ul>
      )}
    </li>
  )

  return (
    <div className="grid gap-xl lg:grid-cols-[2fr_1fr]">
      <section aria-labelledby="arvore" className="flex flex-col gap-md">
        <h2 id="arvore" className="text-headline-md">
          Árvore de categorias
        </h2>
        {tree.length === 0 ? (
          <p className="text-body text-ink-muted">
            Nenhuma categoria cadastrada.
          </p>
        ) : (
          <ul>{tree.map((node) => renderNode(node, 0))}</ul>
        )}
      </section>

      <form
        onSubmit={onSubmit}
        className="flex flex-col gap-md rounded-lg border border-line-subtle bg-elevated p-lg"
        aria-labelledby="form-categoria"
      >
        <h2 id="form-categoria" className="text-headline-sm">
          {draft.id ? "Editar categoria" : "Nova categoria"}
        </h2>
        <FormField id="category-name" label="Nome">
          <Input
            id="category-name"
            required
            value={draft.name}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
          />
        </FormField>
        <FormField
          id="category-slug"
          label="Endereço (slug)"
          hint="Deixe em branco para gerar a partir do nome."
        >
          <Input
            id="category-slug"
            value={draft.slug}
            onChange={(e) => setDraft({ ...draft, slug: e.target.value })}
          />
        </FormField>
        <FormField id="category-parent" label="Categoria mãe">
          <select
            id="category-parent"
            className="h-11 rounded border border-line bg-canvas px-md text-body"
            value={draft.parentId}
            onChange={(e) => setDraft({ ...draft, parentId: e.target.value })}
          >
            <option value="">Nenhuma (categoria principal)</option>
            {categories
              .filter((c) => c.id !== draft.id)
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
          </select>
        </FormField>
        <Label className="flex items-center gap-sm">
          <Checkbox
            checked={draft.active}
            onCheckedChange={(checked) =>
              setDraft({ ...draft, active: checked === true })
            }
          />
          Visível na loja
        </Label>
        {error && (
          <p role="alert" className="text-body-sm text-error">
            {error}
          </p>
        )}
        <div className="flex gap-sm">
          <Button type="submit" disabled={pending}>
            {draft.id ? "Salvar" : "Criar categoria"}
          </Button>
          {draft.id && (
            <Button
              type="button"
              variant="ghost"
              onClick={() => setDraft(emptyDraft)}
            >
              Cancelar
            </Button>
          )}
        </div>
      </form>
    </div>
  )
}
