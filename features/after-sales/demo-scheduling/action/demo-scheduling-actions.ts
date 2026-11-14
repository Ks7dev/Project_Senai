"use server"

import { demoCustomerEmail, demoSalesEmail } from "@/emails/templates"
import {
  demoRequestSchema,
  demoSourceSchema,
  type DemoRequestInput,
  type DemoSource,
} from "@/features/after-sales/demo-scheduling/schema/demo-scheduling-schema"
import { getCurrentUser } from "@/features/shared/lib/auth/session"
import { writeAudit } from "@/features/shared/lib/db/audit"
import { getCorporateContext } from "@/features/shared/lib/db/corporate"
import { UNAUTHENTICATED_MESSAGE } from "@/features/shared/lib/db/permissions"
import { prisma } from "@/features/shared/lib/db/prisma"
import {
  loadDemoBookings,
  loadDemoRules,
} from "@/features/shared/lib/demos/demo-agenda"
import {
  buildDemoAgenda,
  DEMO_MODE_LABEL,
  demoSlotStart,
  earliestDemoDate,
  formatDemoDate,
  isDemoSlotAvailable,
  type DemoDay,
  type DemoModeKey,
  type DemoStatusKey,
} from "@/features/shared/lib/demos/demo-calendar"
import { startOfDateKey } from "@/features/shared/lib/delivery/installation-calendar"
import { enqueueEmail } from "@/features/shared/lib/email/mailer"
import { siteUrl } from "@/features/shared/lib/email/site-url"
import {
  AppError,
  toActionError,
  type ActionResult,
} from "@/features/shared/lib/errors/action-result"
import { enforceActionRateLimit } from "@/features/shared/lib/rate-limit/action-limit"
import { resolveDedicatedSeller } from "@/features/shared/lib/sellers/dedicated-seller"

/** Message when the picked time was taken or is out of the agenda. */
const SLOT_TAKEN_MESSAGE =
  "Este horário não está mais disponível. Escolha outro."

/** A demonstration the customer asked for. */
export type MyDemoRequest = {
  /** Request id. */
  id: string
  /** Start, ISO string. */
  scheduledAt: string
  /** Format. */
  mode: DemoModeKey
  /** Status. */
  status: DemoStatusKey
  /** Product name, if any. */
  product: string | null
  /** Message of the sales team, if any. */
  teamNote: string | null
}

/** What the demonstration page shows (RF19). */
export type DemoScheduling = {
  /** Product the customer came from, if any. */
  product: { name: string; slug: string } | null
  /** Days of the agenda with their times. */
  days: DemoDay[]
  /** Upcoming and recent requests of the customer. */
  requests: MyDemoRequest[]
}

/**
 * Loads the demonstration agenda for the logged-in customer (RF19):
 * the free dates and times from the configured agenda, the product they
 * came from and their own requests with the status.
 *
 * @param input - Query string: `produto`.
 * @returns `{ success: true, scheduling }` or `{ success: false }`.
 */
export async function getDemoScheduling(
  input: DemoSource
): Promise<ActionResult<{ scheduling: DemoScheduling }>> {
  try {
    const source = demoSourceSchema.parse(input ?? {})
    const user = await getCurrentUser()
    if (!user) throw new AppError(UNAUTHENTICATED_MESSAGE, "unauthenticated")

    const now = new Date()
    const rules = await loadDemoRules()
    const [booked, product, requests] = await Promise.all([
      loadDemoBookings(startOfDateKey(earliestDemoDate(now, rules))),
      source.produto
        ? prisma.product.findFirst({
            where: { slug: source.produto, status: "ACTIVE", deletedAt: null },
            select: { name: true, slug: true },
          })
        : null,
      prisma.demoRequest.findMany({
        where: { userId: user.id },
        orderBy: { scheduledAt: "desc" },
        take: 20,
        select: {
          id: true,
          scheduledAt: true,
          mode: true,
          status: true,
          teamNote: true,
          product: { select: { name: true } },
        },
      }),
    ])
    return {
      success: true,
      scheduling: {
        product,
        days: buildDemoAgenda({ now, rules, booked }),
        requests: requests.map((row) => ({
          id: row.id,
          scheduledAt: row.scheduledAt.toISOString(),
          mode: row.mode,
          status: row.status,
          product: row.product?.name ?? null,
          teamNote: row.teamNote,
        })),
      },
    }
  } catch (error) {
    return toActionError(error, { action: "getDemoScheduling" })
  }
}

/**
 * Asks for a demonstration (RF19): the customer picks the date and time
 * in the agenda and the dedicated seller of the account (RN11) receives
 * it. In one transaction it locks the time (`SELECT ... FOR UPDATE`,
 * justified raw query: Prisma has no row lock), checks the room left,
 * records the request, queues the e-mails to the customer and to the
 * seller (RF53) and writes the audit log (RNF12).
 *
 * @param input - Date, time, format, product, phone and notes.
 * @returns `{ success: true, requestId }` or `{ success: false }`.
 */
export async function requestDemo(
  input: DemoRequestInput
): Promise<ActionResult<{ requestId: string }>> {
  try {
    const parsed = demoRequestSchema.safeParse(input)
    if (!parsed.success) {
      throw new AppError(
        parsed.error.issues[0]?.message ?? "Revise a solicitação.",
        "invalid"
      )
    }
    const user = await getCurrentUser()
    if (!user) throw new AppError(UNAUTHENTICATED_MESSAGE, "unauthenticated")
    await enforceActionRateLimit("demo-request", {
      limit: 5,
      windowMs: 60_000,
    })
    const data = parsed.data

    const [corporate, product, seller] = await Promise.all([
      getCorporateContext(),
      data.productSlug
        ? prisma.product.findFirst({
            where: {
              slug: data.productSlug,
              status: "ACTIVE",
              deletedAt: null,
            },
            select: { id: true, name: true },
          })
        : null,
      resolveDedicatedSeller(user),
    ])
    if (data.productSlug && !product) {
      throw new AppError("Produto não encontrado.", "invalid_product")
    }
    const organization = corporate
      ? await prisma.organization.findUnique({
          where: { id: corporate.organizationId },
          select: { name: true },
        })
      : null

    const now = new Date()
    const scheduledAt = demoSlotStart(data.date, data.time)
    const when = formatDemoDate(scheduledAt.toISOString())
    const mode = DEMO_MODE_LABEL[data.mode]

    const requestId = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`
        SELECT id FROM demo_requests
        WHERE scheduled_at = ${scheduledAt}
        FOR UPDATE`
      const rules = await loadDemoRules(tx)
      const booked = await loadDemoBookings(scheduledAt, tx)
      if (
        !isDemoSlotAvailable({
          date: data.date,
          time: data.time,
          now,
          rules,
          booked,
        })
      ) {
        throw new AppError(SLOT_TAKEN_MESSAGE, "slot_taken")
      }
      const request = await tx.demoRequest.create({
        data: {
          userId: user.id,
          organizationId: corporate?.organizationId ?? null,
          productId: product?.id ?? null,
          sellerId: seller?.id ?? null,
          mode: data.mode,
          scheduledAt,
          phone: data.phone || null,
          notes: data.notes || null,
        },
        select: { id: true },
      })
      await enqueueEmail(
        tx,
        {
          to: user.email,
          ...demoCustomerEmail({
            name: user.name,
            stage: "received",
            when,
            mode,
            product: product?.name ?? null,
            url: `${siteUrl()}/demonstracao`,
          }),
        },
        now
      )
      if (seller) {
        await enqueueEmail(
          tx,
          {
            to: seller.email,
            ...demoSalesEmail({
              sellerName: seller.name,
              customer: user.name,
              company: organization?.name ?? null,
              when,
              mode,
              product: product?.name ?? null,
              url: `${siteUrl()}/admin/atendimento/demonstracoes`,
            }),
          },
          now
        )
      }
      await writeAudit(tx, {
        userId: user.id,
        action: "demo_request.create",
        entity: "demo_request",
        entityId: request.id,
        after: {
          scheduledAt,
          mode: data.mode,
          productId: product?.id ?? null,
          sellerId: seller?.id ?? null,
        },
      })
      return request.id
    })
    return { success: true, requestId }
  } catch (error) {
    return toActionError(error, { action: "requestDemo" })
  }
}
