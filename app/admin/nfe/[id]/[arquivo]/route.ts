import { NextResponse } from "next/server"
import { loadInvoiceFile } from "@/features/finance/invoices/action/invoice-actions"
import { INVOICE_FILES } from "@/features/finance/invoices/schema/invoice-schema"

/**
 * Downloads the XML or the DANFE of an issued NF-e (#63, RF13). Back
 * office users with `invoice:manage` only; any other request gets 404,
 * so the route does not tell which NF-e exist.
 *
 * @param _request - Incoming request.
 * @param context - Route params: NF-e id and "xml" or "danfe".
 * @returns The file, or 404.
 */
export async function GET(
  _request: Request,
  context: RouteContext<"/admin/nfe/[id]/[arquivo]">
) {
  const { id, arquivo } = await context.params
  const kind = INVOICE_FILES.find((item) => item === arquivo)
  if (!kind) return new NextResponse(null, { status: 404 })
  const result = await loadInvoiceFile({ invoiceId: id, kind })
  if (!result.success) return new NextResponse(null, { status: 404 })
  return new NextResponse(new Uint8Array(result.file.data), {
    headers: {
      "Content-Type": result.file.contentType,
      "Content-Disposition": `attachment; filename="${result.file.name}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  })
}
