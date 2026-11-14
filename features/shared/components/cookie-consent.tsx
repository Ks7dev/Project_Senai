"use client"

import { useEffect, useId, useState, type ReactNode } from "react"
import Link from "next/link"
import { CookieIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import {
  CONSENT_CATEGORIES,
  CONSENT_COOKIE,
  CONSENT_MAX_AGE_SECONDS,
  hasConsent,
  OPEN_CONSENT_EVENT,
  parseConsent,
  serializeConsent,
  type ConsentCategory,
  type ConsentChoice,
} from "@/features/shared/lib/privacy/consent"

/** Browser event fired after the visitor saves a choice. */
const CONSENT_CHANGED_EVENT = "ab:consent-changed"

/**
 * Reads the choice stored in the browser.
 *
 * @returns The choice, or null when none yet.
 */
function readConsent(): ConsentChoice | null {
  const entry = document.cookie
    .split("; ")
    .find((item) => item.startsWith(`${CONSENT_COOKIE}=`))
  return parseConsent(entry?.slice(CONSENT_COOKIE.length + 1))
}

/**
 * Stores the choice in the essential consent cookie.
 *
 * @param choice - Accepted categories.
 */
function writeConsent(choice: Pick<ConsentChoice, "analytics" | "marketing">) {
  const secure = window.location.protocol === "https:" ? "; Secure" : ""
  document.cookie = `${CONSENT_COOKIE}=${serializeConsent(choice)}; Max-Age=${CONSENT_MAX_AGE_SECONDS}; Path=/; SameSite=Lax${secure}`
  window.dispatchEvent(new Event(CONSENT_CHANGED_EVENT))
}

/**
 * Cookie notice of the store (#75, RF56). Only essential cookies run
 * until the visitor decides; "Recusar" and "Aceitar todos" have the
 * same weight, and the choice can be changed later from the footer.
 *
 * @returns The banner, or nothing after a choice.
 */
export function CookieConsent() {
  const id = useId()
  const [open, setOpen] = useState(false)
  const [details, setDetails] = useState(false)
  const [choice, setChoice] = useState({ analytics: false, marketing: false })

  useEffect(() => {
    const stored = readConsent()
    // The cookie only exists in the browser: decide after hydration
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!stored) setOpen(true)
    const reopen = () => {
      const current = readConsent()
      setChoice({
        analytics: current?.analytics ?? false,
        marketing: current?.marketing ?? false,
      })
      setDetails(true)
      setOpen(true)
    }
    window.addEventListener(OPEN_CONSENT_EVENT, reopen)
    return () => window.removeEventListener(OPEN_CONSENT_EVENT, reopen)
  }, [])

  const save = (value: { analytics: boolean; marketing: boolean }) => {
    writeConsent(value)
    setOpen(false)
    setDetails(false)
  }

  if (!open) return null

  return (
    <section
      role="region"
      aria-labelledby={`${id}-title`}
      className="fixed inset-x-0 bottom-0 z-50 border-t border-line-subtle bg-elevated shadow-lg"
    >
      <div className="mx-auto flex max-w-5xl flex-col gap-md p-md">
        <div className="flex items-start gap-sm">
          <CookieIcon
            className="mt-0.5 size-5 shrink-0 text-primary"
            aria-hidden
          />
          <div className="flex flex-col gap-xs">
            <h2 id={`${id}-title`} className="text-subhead text-ink">
              Cookies e privacidade
            </h2>
            <p className="text-body-sm text-ink-muted">
              Usamos cookies essenciais para manter a sua sessão, o carrinho e a
              segurança da loja. Outros cookies só são usados se você permitir.
              Saiba mais na{" "}
              <Link
                href="/politica-de-privacidade"
                className="text-primary underline"
              >
                Política de privacidade
              </Link>
              .
            </p>
          </div>
        </div>

        {details && (
          <fieldset className="flex flex-col gap-sm">
            <legend className="sr-only">Categorias de cookies</legend>
            <p className="text-body-sm text-ink">
              <strong>Essenciais</strong> · sempre ativos: sessão, carrinho,
              segurança e esta escolha.
            </p>
            {(Object.keys(CONSENT_CATEGORIES) as ConsentCategory[]).map(
              (category) => (
                <Label key={category} className="flex items-start gap-sm">
                  <Checkbox
                    checked={choice[category]}
                    onCheckedChange={(checked) =>
                      setChoice((current) => ({
                        ...current,
                        [category]: checked === true,
                      }))
                    }
                  />
                  <span className="flex flex-col">
                    <span className="text-body-sm text-ink">
                      {CONSENT_CATEGORIES[category].label}
                    </span>
                    <span className="text-label-sm text-ink-muted">
                      {CONSENT_CATEGORIES[category].description}
                    </span>
                  </span>
                </Label>
              )
            )}
          </fieldset>
        )}

        <div className="flex flex-wrap gap-sm">
          <Button
            type="button"
            variant="ghost"
            onClick={() => save({ analytics: false, marketing: false })}
          >
            Recusar não essenciais
          </Button>
          {details ? (
            <Button type="button" variant="ghost" onClick={() => save(choice)}>
              Salvar escolhas
            </Button>
          ) : (
            <Button
              type="button"
              variant="subtle"
              aria-expanded={details}
              onClick={() => setDetails(true)}
            >
              Personalizar
            </Button>
          )}
          <Button
            type="button"
            onClick={() => save({ analytics: true, marketing: true })}
          >
            Aceitar todos
          </Button>
        </div>
      </div>
    </section>
  )
}

/**
 * Footer button that reopens the cookie preferences.
 *
 * @returns The button.
 */
export function CookiePreferencesButton() {
  return (
    <button
      type="button"
      className="rounded text-left text-body-sm text-ink-muted underline hover:text-ink"
      onClick={() => window.dispatchEvent(new Event(OPEN_CONSENT_EVENT))}
    >
      Preferências de cookies
    </button>
  )
}

/**
 * Renders its children (a non-essential script or embed) only after the
 * visitor accepted the category (RF56). Nothing runs before the choice.
 *
 * @param props - Category and the gated content.
 * @returns The content, or nothing.
 */
export function ConsentGate({
  category,
  children,
}: {
  category: ConsentCategory
  children: ReactNode
}) {
  const [allowed, setAllowed] = useState(false)
  useEffect(() => {
    const update = () => setAllowed(hasConsent(readConsent(), category))
    update()
    window.addEventListener(CONSENT_CHANGED_EVENT, update)
    return () => window.removeEventListener(CONSENT_CHANGED_EVENT, update)
  }, [category])
  return allowed ? <>{children}</> : null
}
