// Messages exchanged between the app workers and the cluster primary
// (issue #79, RNF02). Plain JavaScript: it is loaded by the launcher and
// by the cache handler at runtime, outside the Next.js bundle, and by
// the app code through the bundler.

/** Environment variable with the role of a worker process. */
export const WORKER_ROLE_ENV = "APP_WORKER_ROLE"

/** Environment variable with the number of app workers. */
export const WORKERS_ENV = "APP_WORKERS"

/** Default number of app workers when `APP_WORKERS` is not set. */
export const DEFAULT_WORKERS = 4

/**
 * Types of the IPC messages. `cacheTags` carries a tag revalidation to
 * the other workers; `rateLimit` and `rateLimitResult` ask the
 * coordinator worker to count a request and carry its answer back.
 */
export const MESSAGE_TYPES = Object.freeze({
  cacheTags: "atelier:cache-tags",
  rateLimit: "atelier:rate-limit",
  rateLimitResult: "atelier:rate-limit-result",
})

/**
 * Number of workers to start: `APP_WORKERS` when it is a positive
 * integer, otherwise the default, never more than the CPUs available.
 *
 * @param {string | undefined} value - Value of `APP_WORKERS`.
 * @param {number} cpus - CPUs available to the process.
 * @returns {number} The number of workers (at least 1).
 */
export function workerCount(value, cpus) {
  const parsed = Number(value)
  const wanted =
    Number.isInteger(parsed) && parsed > 0 ? parsed : DEFAULT_WORKERS
  return Math.max(1, Math.min(wanted, Math.max(1, cpus)))
}

/**
 * Decides where the primary forwards a message received from a worker.
 * Unknown messages (including the ones Next.js itself may send) are
 * ignored.
 *
 * @param {unknown} message - Message sent by the worker.
 * @param {number} fromId - Id of the sending worker.
 * @param {number[]} workerIds - Ids of the live workers.
 * @param {number | null} coordinatorId - Id of the coordinator, or null
 *   while it restarts.
 * @returns {Array<{ to: number, message: Record<string, unknown> }>}
 *   The deliveries to make.
 */
export function routeMessage(message, fromId, workerIds, coordinatorId) {
  if (!message || typeof message !== "object") return []
  const typed = /** @type {Record<string, unknown>} */ (message)
  switch (typed.type) {
    case MESSAGE_TYPES.cacheTags:
      return workerIds
        .filter((id) => id !== fromId)
        .map((id) => ({ to: id, message: typed }))
    case MESSAGE_TYPES.rateLimit:
      if (coordinatorId === null || !workerIds.includes(coordinatorId)) {
        // No coordinator: the worker falls back to its own counter
        return [
          {
            to: fromId,
            message: {
              type: MESSAGE_TYPES.rateLimitResult,
              requestId: typed.requestId,
              result: null,
            },
          },
        ]
      }
      return [{ to: coordinatorId, message: { ...typed, from: fromId } }]
    case MESSAGE_TYPES.rateLimitResult:
      return typeof typed.to === "number" && workerIds.includes(typed.to)
        ? [{ to: typed.to, message: typed }]
        : []
    default:
      return []
  }
}
