import { PageContainer } from "@/components/layout/page-container"

type AuthCardProps = {
  /** Small uppercase label above the title. */
  eyebrow: string
  /** Page title. */
  title: string
  /** Short explanation below the title. */
  description?: string
  /** Form and links. */
  children: React.ReactNode
}

/**
 * Centered card used by the login, sign-up and password pages.
 *
 * @param props - Texts and form.
 * @returns The card.
 */
export function AuthCard({
  eyebrow,
  title,
  description,
  children,
}: AuthCardProps) {
  return (
    <PageContainer className="flex flex-1 justify-center py-xl">
      <div className="flex w-full max-w-xl flex-col gap-lg rounded-lg border border-line-subtle bg-elevated p-lg md:p-xl">
        <header className="flex flex-col gap-sm">
          <p className="text-caps text-clay uppercase">{eyebrow}</p>
          <h1 className="text-headline-xl-mobile lg:text-headline-xl">
            {title}
          </h1>
          {description && (
            <p className="text-body text-ink-muted">{description}</p>
          )}
        </header>
        {children}
      </div>
    </PageContainer>
  )
}
