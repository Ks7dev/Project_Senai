"use client"

import { useState, useTransition } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Button, buttonVariants } from "@/components/ui/button"
import {
  deleteProjectList,
  resumeProjectList,
} from "@/features/cart/project-lists/action/project-list-actions"
import type { ProjectListView } from "@/features/shared/lib/cart/cart-types"

const brl = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
})

const date = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short" })

/**
 * Saved project lists of the customer area (#46, RF07): each list can
 * be resumed (its items go into the cart) or deleted.
 *
 * @param props - Saved lists.
 * @returns The page content.
 */
export function ProjectListsView({ lists }: { lists: ProjectListView[] }) {
  const router = useRouter()
  const [message, setMessage] = useState<string>()
  const [error, setError] = useState<string>()
  const [pending, startTransition] = useTransition()

  const resume = (list: ProjectListView) => {
    setMessage(undefined)
    setError(undefined)
    startTransition(async () => {
      const result = await resumeProjectList({ listId: list.id })
      if (!result.success) return setError(result.error)
      if (result.skipped > 0) {
        setMessage(
          `${result.skipped} ${result.skipped === 1 ? "produto indisponível ficou" : "produtos indisponíveis ficaram"} de fora.`
        )
      }
      router.push("/carrinho")
      router.refresh()
    })
  }

  const remove = (list: ProjectListView) => {
    if (!window.confirm(`Excluir a lista "${list.name}"?`)) return
    setMessage(undefined)
    setError(undefined)
    startTransition(async () => {
      const result = await deleteProjectList({ listId: list.id })
      if (!result.success) return setError(result.error)
      setMessage("Lista excluída.")
      router.refresh()
    })
  }

  return (
    <>
      <header>
        <p className="text-caps text-clay uppercase">Minha conta</p>
        <h1 className="text-headline-xl-mobile lg:text-headline-xl">
          Listas de projeto
        </h1>
      </header>
      <p role="alert" className="text-body-sm text-destructive empty:hidden">
        {error}
      </p>
      <p role="status" className="text-body-sm text-ink empty:hidden">
        {message}
      </p>
      {lists.length === 0 ? (
        <div className="flex flex-col items-start gap-md rounded-lg bg-subtle p-lg">
          <p className="text-body text-ink-muted">
            Você ainda não salvou listas. No carrinho, use “Salvar como lista de
            projeto” para guardar uma seleção e retomá-la depois.
          </p>
          <Link
            href="/carrinho"
            className={buttonVariants({ variant: "ghost" })}
          >
            Ir para o carrinho
          </Link>
        </div>
      ) : (
        <ul className="flex flex-col gap-md">
          {lists.map((list) => (
            <li
              key={list.id}
              className="flex flex-col gap-sm rounded-lg border border-line-subtle p-md"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-sm">
                <h2 className="text-headline-sm">{list.name}</h2>
                <span className="text-body-sm text-ink-muted">
                  Atualizada em {date.format(new Date(list.updatedAt))}
                </span>
              </div>
              <ul className="flex flex-col gap-xs text-body-sm">
                {list.lines.map((line) => (
                  <li key={line.id} className="flex justify-between gap-md">
                    <span>
                      {line.quantity} × {line.productName} · {line.skuName}
                      {!line.purchasable && (
                        <span className="text-destructive">
                          {" "}
                          (indisponível)
                        </span>
                      )}
                    </span>
                    <span>{brl.format(Number(line.total))}</span>
                  </li>
                ))}
              </ul>
              <p className="text-body-sm">
                Total atual:{" "}
                <strong>{brl.format(Number(list.subtotal))}</strong>
              </p>
              <div className="flex flex-wrap gap-sm">
                <Button
                  type="button"
                  disabled={pending}
                  onClick={() => resume(list)}
                >
                  Retomar no carrinho
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  disabled={pending}
                  onClick={() => remove(list)}
                >
                  Excluir lista
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}
