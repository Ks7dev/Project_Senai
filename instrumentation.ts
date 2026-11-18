/**
 * Next.js server start hook, on the Node.js runtime only, never during
 * `next build`: encrypts the personal data written before the
 * encryption at rest (RNF03) and schedules the background jobs (order
 * expiration, RN14, and the e-mail queue, RF53). In the app cluster
 * (#79) only the coordinator worker does this work, and it also holds
 * the rate limit counters shared by the workers.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return
  if (process.env.NEXT_PHASE === "phase-production-build") return
  // App cluster (#79): the coordinator holds the shared rate limit
  // counters and is the only worker that runs the once-per-server work
  const { runsBackgroundTasks } =
    await import("@/features/shared/lib/cluster/cluster-role")
  const { startRateLimitCoordinator } =
    await import("@/features/shared/lib/rate-limit/shared-limit")
  startRateLimitCoordinator()
  if (!runsBackgroundTasks()) return
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
