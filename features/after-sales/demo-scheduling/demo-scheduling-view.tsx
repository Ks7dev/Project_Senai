"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { zodResolver } from "@hookform/resolvers/zod"
import { useForm, useWatch } from "react-hook-form"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { FormField, fieldAria } from "@/components/ui/form-field"
import { Input } from "@/components/ui/input"
import {
  requestDemo,
  type DemoScheduling,
} from "@/features/after-sales/demo-scheduling/action/demo-scheduling-actions"
import {
  demoRequestSchema,
  type DemoRequestData,
  type DemoRequestInput,
} from "@/features/after-sales/demo-scheduling/schema/demo-scheduling-schema"
import {
  DEMO_MODE_LABEL,
  DEMO_MODES,
  DEMO_STATUS_LABEL,
  formatDemoDate,
} from "@/features/shared/lib/demos/demo-calendar"
import { cn } from "@/lib/utils"

const dayLabel = new Intl.DateTimeFormat("pt-BR", {
  weekday: "long",
  day: "numeric",
  month: "long",
  timeZone: "UTC",
})

/**
 * Formats a calendar date for the date select.
 *
 * @param date - Calendar date "AAAA-MM-DD".
 * @returns E.g. "segunda-feira, 16 de novembro".
 */
function formatDay(date: string): string {
  return dayLabel.format(new Date(`${date}T12:00:00.000Z`))
}

/**
 * Demonstration scheduling (RF19): the customer picks the format, the
 * date and a free time of the agenda, and follows the status of their
 * requests. The seller of the account receives each request.
 *
 * @param props - Agenda, product and the customer requests.
 * @returns The form and the list.
 */
export function DemoSchedulingView({
  scheduling,
}: {
  scheduling: DemoScheduling
}) {
  const router = useRouter()
  const [error, setError] = useState<string>()
  const [notice, setNotice] = useState<string>()
  const [pending, startTransition] = useTransition()
  const firstDay = scheduling.days.find((day) =>
    day.slots.some((slot) => slot.available)
  )
  const form = useForm<DemoRequestInput, unknown, DemoRequestData>({
    resolver: zodResolver(demoRequestSchema),
    defaultValues: {
      date: firstDay?.date ?? "",
      time: "",
      mode: "SHOWROOM",
      productSlug: scheduling.product?.slug ?? "",
      phone: "",
      notes: "",
    },
  })
  const date = useWatch({ control: form.control, name: "date" })
  const time = useWatch({ control: form.control, name: "time" })
  const day = scheduling.days.find((item) => item.date === date)
  const errors = form.formState.errors

  const onSubmit = form.handleSubmit((values) =>
    startTransition(async () => {
      setError(undefined)
      setNotice(undefined)
      const result = await requestDemo(values)
      if (!result.success) return setError(result.error)
      setNotice(
        "Demonstração solicitada. O seu vendedor recebeu o pedido e confirma por e-mail."
      )
      form.reset({ ...values, time: "", notes: "" })
      router.refresh()
    })
  )

  return (
    <div className="flex flex-col gap-xl">
      {!firstDay ? (
        <p className="rounded-lg bg-subtle p-lg text-body text-ink-muted">
          Não há horários livres na agenda no momento. Fale com o seu vendedor
          pela página de atendimento.
        </p>
      ) : (
        <form onSubmit={onSubmit} noValidate className="flex flex-col gap-lg">
          {scheduling.product && (
            <p className="text-body">
              Produto: <strong>{scheduling.product.name}</strong>
            </p>
          )}
          <fieldset className="flex flex-col gap-sm">
            <legend className="text-label">Formato</legend>
            <div className="flex flex-wrap gap-md">
              {DEMO_MODES.map((mode) => (
                <label
                  key={mode}
                  className="flex items-center gap-sm text-body"
                >
                  <input
                    type="radio"
                    value={mode}
                    className="size-4 accent-primary"
                    {...form.register("mode")}
                  />
                  {DEMO_MODE_LABEL[mode]}
                </label>
              ))}
            </div>
          </fieldset>

          <FormField id="demo-date" label="Data" error={errors.date?.message}>
            <select
              id="demo-date"
              className="h-11 rounded border border-line bg-canvas px-md text-body"
              {...fieldAria("demo-date", errors.date?.message)}
              {...form.register("date", {
                onChange: () => form.setValue("time", ""),
              })}
            >
              {scheduling.days.map((item) => {
                const free = item.slots.some((slot) => slot.available)
                return (
                  <option key={item.date} value={item.date} disabled={!free}>
                    {formatDay(item.date)}
                    {free ? "" : " (agenda cheia)"}
                  </option>
                )
              })}
            </select>
          </FormField>

          <fieldset className="flex flex-col gap-sm">
            <legend className="text-label">
              Horário (horário de Brasília)
            </legend>
            <div className="flex flex-wrap gap-sm">
              {day?.slots.map((slot) => (
                <label
                  key={slot.time}
                  className={cn(
                    "flex cursor-pointer items-center gap-xs rounded border px-md py-2 text-body",
                    slot.time === time
                      ? "border-primary bg-primary-tint"
                      : "border-line",
                    !slot.available && "cursor-not-allowed text-ink-disabled"
                  )}
                >
                  <input
                    type="radio"
                    value={slot.time}
                    disabled={!slot.available}
                    className="size-4 accent-primary"
                    {...form.register("time")}
                  />
                  {slot.time}
                  {!slot.available && (
                    <span className="sr-only"> (ocupado)</span>
                  )}
                </label>
              ))}
            </div>
            {errors.time?.message && (
              <p role="alert" className="text-body-sm text-error">
                {errors.time.message}
              </p>
            )}
          </fieldset>

          <FormField
            id="demo-phone"
            label="Telefone para contato (opcional)"
            error={errors.phone?.message}
          >
            <Input
              id="demo-phone"
              inputMode="tel"
              placeholder="(11) 91234-5678"
              {...fieldAria("demo-phone", errors.phone?.message)}
              {...form.register("phone")}
            />
          </FormField>
          <FormField
            id="demo-notes"
            label="Sobre o projeto (opcional)"
            error={errors.notes?.message}
            hint="Quantidade de postos, ambiente, endereço da visita ou o que quer ver na demonstração."
          >
            <textarea
              id="demo-notes"
              rows={4}
              className="rounded border border-line bg-canvas p-md text-body"
              {...fieldAria("demo-notes", errors.notes?.message)}
              {...form.register("notes")}
            />
          </FormField>

          {error && (
            <p role="alert" className="text-body-sm text-error">
              {error}
            </p>
          )}
          {notice && (
            <p role="status" className="rounded bg-primary-tint p-md text-body">
              {notice}
            </p>
          )}
          <Button
            type="submit"
            size="lg"
            className="self-start"
            disabled={pending}
          >
            {pending ? "Enviando…" : "Solicitar demonstração"}
          </Button>
        </form>
      )}

      <section aria-labelledby="minhas" className="flex flex-col gap-sm">
        <h2 id="minhas" className="text-headline-md">
          Minhas demonstrações
        </h2>
        {scheduling.requests.length === 0 ? (
          <p className="text-body text-ink-muted">
            Nenhuma demonstração solicitada.
          </p>
        ) : (
          <ul className="flex flex-col gap-sm">
            {scheduling.requests.map((request) => (
              <li
                key={request.id}
                className="flex flex-col gap-xs rounded-lg border border-line-subtle p-md"
              >
                <div className="flex flex-wrap items-center gap-sm">
                  <span className="text-body">
                    {formatDemoDate(request.scheduledAt)}
                  </span>
                  <Badge
                    variant={
                      request.status === "CANCELED"
                        ? "destructive"
                        : request.status === "CONFIRMED"
                          ? "default"
                          : "outline"
                    }
                  >
                    {DEMO_STATUS_LABEL[request.status]}
                  </Badge>
                </div>
                <p className="text-body-sm text-ink-muted">
                  {DEMO_MODE_LABEL[request.mode]}
                  {request.product ? ` · ${request.product}` : ""}
                </p>
                {request.teamNote && (
                  <p className="text-body-sm">
                    Mensagem da equipe: {request.teamNote}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
