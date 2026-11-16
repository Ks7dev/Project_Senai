import { NextResponse } from "next/server"
import {
  IMPORT_COLUMNS,
  TEMPLATE_EXAMPLE,
} from "@/features/catalog/products-admin/schema/import-schema"
import { toCsv } from "@/features/shared/lib/csv/csv"
import { requirePermission } from "@/features/shared/lib/db/permissions"
import { AppError } from "@/features/shared/lib/errors/action-result"

/**
 * Downloads the product import template (#29): header and one example
 * row, ";" separated so it opens correctly in Excel in Portuguese.
 * Back office users with product:create only.
 *
 * @returns The CSV file, or 401/403.
 */
export async function GET() {
  try {
    await requirePermission("product:create")
  } catch (error) {
    const status =
      error instanceof AppError && error.code === "unauthenticated" ? 401 : 403
    return new NextResponse(null, { status })
  }
  const csv = toCsv([
    [...IMPORT_COLUMNS],
    IMPORT_COLUMNS.map((column) => TEMPLATE_EXAMPLE[column]),
  ])
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition":
        'attachment; filename="modelo-importacao-produtos.csv"',
      "Cache-Control": "no-store",
    },
  })
}
