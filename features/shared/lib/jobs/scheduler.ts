import "server-only"
import { logger } from "@/features/shared/lib/logger/logger"

/** A background job run at a fixed interval by the app server. */
export type Job = {
  /** Name used in the logs. */
  name: string
  /** Interval between runs, in milliseconds. */
  everyMs: number
  /** Work to do; errors are logged and the next run happens anyway. */
  run: () => Promise<unknown>
}

const globalForJobs = globalThis as unknown as {
  atelierJobs?: ReturnType<typeof setInterval>[]
}

/**
 * Runs one job, never letting an error escape: the log keeps only the
 * error name (no payload or personal data, RNF05).
 *
 * @param job - The job.
 */
export async function runJobSafely(job: Job): Promise<void> {
  try {
    await job.run()
  } catch (error) {
    logger.error("background job failed", {
      job: job.name,
      error: error instanceof Error ? error.name : "unknown",
    })
  }
}

/**
 * Starts the background jobs of the app server (the local Docker
 * server runs a single app container, so an in-process interval is
 * enough). Starting twice is ignored, which covers hot reloads in
 * development. Set `JOBS_DISABLED=true` to turn them off.
 *
 * @param jobs - Jobs to schedule.
 * @returns Whether the jobs were started now.
 */
export function startJobs(jobs: readonly Job[]): boolean {
  if (process.env.JOBS_DISABLED === "true") return false
  if (globalForJobs.atelierJobs) return false
  globalForJobs.atelierJobs = jobs.map((job) => {
    let running = false
    const timer = setInterval(() => {
      if (running) return
      running = true
      void runJobSafely(job).finally(() => {
        running = false
      })
    }, job.everyMs)
    timer.unref?.()
    return timer
  })
  logger.info("background jobs started", { count: jobs.length })
  return true
}
