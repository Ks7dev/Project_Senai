import Link from "next/link"
import { Badge } from "@/components/ui/badge"
import { buttonVariants } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import type { AdminProductRow } from "@/features/catalog/products-admin/action/product-actions"

const STATUS_LABEL: Record<AdminProductRow["status"], string> = {
  DRAFT: "Rascunho",
  ACTIVE: "Publicado",
  INACTIVE: "Inativo",
}

const brl = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
})

type ProductsListViewProps = {
  /** Products to show. */
  products: AdminProductRow[]
  /** Current search text. */
  search: string
  /** Current status filter. */
  status: string
  /** Whether the user may create products. */
  canCreate: boolean
}

/**
 * Back office product list with search by name or SKU and status
 * filter (#21). Uses a plain GET form, so it works without JavaScript.
 *
 * @param props - Products, filters and permissions.
 * @returns The list.
 */
export function ProductsListView({
  products,
  search,
  status,
  canCreate,
}: ProductsListViewProps) {
  return (
    <div className="flex flex-col gap-lg">
      <div className="flex flex-wrap items-end gap-md">
        <form
          role="search"
          className="flex flex-1 flex-wrap items-end gap-sm"
          action="/admin/produtos"
        >
          <div className="flex min-w-60 flex-1 flex-col gap-xs">
            <label htmlFor="busca-produto" className="text-label">
              Buscar por nome ou SKU
            </label>
            <Input id="busca-produto" name="q" defaultValue={search} />
          </div>
          <div className="flex flex-col gap-xs">
            <label htmlFor="status-produto" className="text-label">
              Status
            </label>
            <select
              id="status-produto"
              name="status"
              defaultValue={status}
              className="h-11 rounded border border-line bg-canvas px-md text-body"
            >
              <option value="">Todos</option>
              <option value="DRAFT">Rascunho</option>
              <option value="ACTIVE">Publicado</option>
              <option value="INACTIVE">Inativo</option>
            </select>
          </div>
          <button
            type="submit"
            className={buttonVariants({ variant: "ghost" })}
          >
            Filtrar
          </button>
        </form>
        {canCreate && (
          <Link href="/admin/produtos/novo" className={buttonVariants()}>
            Novo produto
          </Link>
        )}
      </div>

      {products.length === 0 ? (
        <p className="text-body text-ink-muted">Nenhum produto encontrado.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-line-subtle">
          <table className="w-full min-w-[640px] text-left text-body-sm">
            <caption className="sr-only">Produtos cadastrados</caption>
            <thead className="bg-subtle text-label">
              <tr>
                <th scope="col" className="p-sm">
                  Produto
                </th>
                <th scope="col" className="p-sm">
                  Categoria
                </th>
                <th scope="col" className="p-sm">
                  Preço
                </th>
                <th scope="col" className="p-sm">
                  SKUs
                </th>
                <th scope="col" className="p-sm">
                  Status
                </th>
              </tr>
            </thead>
            <tbody>
              {products.map((product) => (
                <tr key={product.id} className="border-t border-line-subtle">
                  <td className="p-sm">
                    <Link
                      href={`/admin/produtos/${product.id}`}
                      className="text-primary underline"
                    >
                      {product.name}
                    </Link>
                  </td>
                  <td className="p-sm">{product.category}</td>
                  <td className="p-sm">
                    {brl.format(Number(product.basePrice))}
                  </td>
                  <td className="p-sm">{product.skus}</td>
                  <td className="p-sm">
                    <Badge
                      variant={
                        product.status === "ACTIVE" ? "default" : "outline"
                      }
                    >
                      {STATUS_LABEL[product.status]}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
