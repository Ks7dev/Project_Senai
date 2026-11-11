/**
 * Next.js server start hook: schedules the background jobs (order
 * expiration, RN14, and the e-mail queue, RF53) on the Node.js runtime only, never during
 * `next build`.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return
  if (process.env.NEXT_PHASE === "phase-production-build") return
  const { startJobs } = await import("@/features/shared/lib/jobs/scheduler")
  const { appJobs } = await import("@/features/shared/lib/jobs/app-jobs")
  startJobs(appJobs)
}
