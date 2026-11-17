"use client"

import { useState, useTransition } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Button, buttonVariants } from "@/components/ui/button"
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
 * Lets corporate account users and internal profiles turn 2FA on and
 * off (RF40). For profiles with access to orders, payments or refunds
 * 2FA is mandatory and cannot be turned off (#177); the server enforces
 * it, this view only explains it.
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

  if (!status.corporate && !status.internal) {
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

      {status.required && (
        <RequiredNotice
          twoFactorEnabled={status.twoFactorEnabled}
          sessionVerified={status.sessionVerified}
        />
      )}

      {!setup && !(status.required && status.twoFactorEnabled) && (
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

      {status.twoFactorEnabled && !status.required && (
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

type RequiredNoticeProps = {
  /** Whether 2FA is on. */
  twoFactorEnabled: boolean
  /** Whether the current session was opened with the 2FA code. */
  sessionVerified: boolean
}

/**
 * Explains why 2FA is mandatory for the profile and what is missing to
 * enter the back office (#177).
 *
 * @param props - 2FA state of the account and the session.
 * @returns The notice.
 */
function RequiredNotice({
  twoFactorEnabled,
  sessionVerified,
}: RequiredNoticeProps) {
  if (!twoFactorEnabled) {
    return (
      <p
        role="status"
        className="rounded border border-line-subtle bg-subtle p-md text-body"
      >
        O seu perfil tem acesso a pedidos, pagamentos ou estornos, por isso a
        verificação em duas etapas é obrigatória. Ative-a abaixo para acessar o
        back office.
      </p>
    )
  }
  if (!sessionVerified) {
    return (
      <p
        role="status"
        className="rounded border border-line-subtle bg-subtle p-md text-body"
      >
        Esta sessão foi aberta sem o código do aplicativo autenticador. Saia e
        entre novamente, informando o código, para acessar o back office.
      </p>
    )
  }
  return (
    <div className="flex flex-col gap-sm">
      <p className="text-body text-ink-muted">
        Obrigatória para o seu perfil, que tem acesso a pedidos, pagamentos ou
        estornos.
      </p>
      <Link
        href="/admin"
        className={buttonVariants({
          variant: "ghost",
          className: "self-start",
        })}
      >
        Ir para o back office
      </Link>
    </div>
  )
}
