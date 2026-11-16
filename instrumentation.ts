/**
 * Next.js server start hook, on the Node.js runtime only, never during
 * `next build`: encrypts the personal data written before the
 * encryption at rest (RNF03) and schedules the background jobs (order
 * expiration, RN14, and the e-mail queue, RF53).
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return
  if (process.env.NEXT_PHASE === "phase-production-build") return
  const { encryptLegacyPersonalData } =
    await import("@/features/shared/lib/privacy/encrypt-legacy")
  const { logger } = await import("@/features/shared/lib/logger/logger")
  // A failure is logged and retried on the next start; the app reads
  // plain and encrypted values alike, so it keeps working meanwhile
  await encryptLegacyPersonalData().catch((error: unknown) =>
    logger.error("legacy personal data encryption failed", {
      error: error instanceof Error ? error.name : "unknown",
    })
  )
  const { startJobs } = await import("@/features/shared/lib/jobs/scheduler")
  const { appJobs } = await import("@/features/shared/lib/jobs/app-jobs")
  startJobs(appJobs)
}
