"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { FormField } from "@/components/ui/form-field"
import { Input } from "@/components/ui/input"
import {
  confirmTwoFactor,
  disableTwoFactor,
  startTwoFactor,
  type SecurityStatus,
} from "@/features/access/security/action/two-factor"

type SecurityViewProps = {
  /** 2FA situation of the user. */
  status: SecurityStatus
}

/**
 * Lets corporate account users turn 2FA on and off (RF40).
 *
 * @param props - Current 2FA status.
 * @returns The security section.
 */
export function SecurityView({ status }: SecurityViewProps) {
  const router = useRouter()
  const [password, setPassword] = useState("")
  const [code, setCode] = useState("")
  const [setup, setSetup] = useState<{
    totpUri: string
    backupCodes: string[]
  }>()
  const [message, setMessage] = useState<string>()
  const [error, setError] = useState<string>()
  const [pending, startTransition] = useTransition()

  const run = (action: () => Promise<void>) => {
    setError(undefined)
    setMessage(undefined)
    startTransition(action)
  }

  if (!status.corporate) {
    return (
      <p className="text-body text-ink-muted">
        A verificação em duas etapas está disponível para contas corporativas.
      </p>
    )
  }

  const secret = setup
    ? (new URL(setup.totpUri).searchParams.get("secret") ?? "")
    : ""

  return (
    <section
      aria-labelledby="dois-fatores"
      className="flex flex-col gap-md rounded-lg border border-line-subtle bg-elevated p-lg"
    >
      <h2 id="dois-fatores" className="text-headline-md">
        Verificação em duas etapas
      </h2>
      <p className="text-body text-ink-muted">
        {status.twoFactorEnabled
          ? "Ativada. Ao entrar, será pedido o código do aplicativo autenticador."
          : "Desativada. Ative para pedir um código do aplicativo autenticador a cada login."}
      </p>

      {!setup && (
        <FormField id="password" label="Confirme a sua senha">
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </FormField>
      )}

      {!status.twoFactorEnabled && !setup && (
        <Button
          disabled={pending || !password}
          onClick={() =>
            run(async () => {
              const result = await startTwoFactor({ password })
              if (!result.success) return setError(result.error)
              setSetup({
                totpUri: result.totpUri,
                backupCodes: result.backupCodes,
              })
              setPassword("")
            })
          }
        >
          Ativar verificação em duas etapas
        </Button>
      )}

      {setup && (
        <div className="flex flex-col gap-md">
          <p className="text-body">
            No aplicativo autenticador, adicione uma conta com a chave abaixo e
            digite o código gerado para concluir.
          </p>
          <code className="rounded bg-subtle p-sm text-body-sm break-all">
            {secret}
          </code>
          <div>
            <p className="pb-xs text-label font-medium">
              Códigos de recuperação (guarde em local seguro)
            </p>
            <ul className="grid grid-cols-2 gap-xs text-body-sm">
              {setup.backupCodes.map((backupCode) => (
                <li key={backupCode}>
                  <code>{backupCode}</code>
                </li>
              ))}
            </ul>
          </div>
          <FormField id="code" label="Código do aplicativo">
            <Input
              id="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={code}
              onChange={(event) => setCode(event.target.value)}
            />
          </FormField>
          <Button
            disabled={pending || code.length !== 6}
            onClick={() =>
              run(async () => {
                const result = await confirmTwoFactor({ code })
                if (!result.success) return setError(result.error)
                setSetup(undefined)
                setCode("")
                setMessage("Verificação em duas etapas ativada.")
                router.refresh()
              })
            }
          >
            Confirmar ativação
          </Button>
        </div>
      )}

      {status.twoFactorEnabled && (
        <Button
          variant="ghost"
          disabled={pending || !password}
          onClick={() =>
            run(async () => {
              const result = await disableTwoFactor({ password })
              if (!result.success) return setError(result.error)
              setPassword("")
              setMessage("Verificação em duas etapas desativada.")
              router.refresh()
            })
          }
        >
          Desativar
        </Button>
      )}

      {message && (
        <p role="status" className="text-body-sm text-success">
          {message}
        </p>
      )}
      {error && (
        <p role="alert" className="text-body-sm text-error">
          {error}
        </p>
      )}
    </section>
  )
}
