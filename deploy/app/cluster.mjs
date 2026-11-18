// Starts the Next.js standalone server as a cluster of worker processes
// (issue #79, RNF02). Page rendering is CPU bound and a single Node.js
// process uses one core, so under 3x the average traffic the requests
// queue up. The workers share port 3000; the primary only relays the
// cache revalidations and the rate limit checks between them.
//
// Roles: the first worker is the "coordinator" (background jobs, legacy
// data encryption and the shared rate limit counters); the others are
// "worker". A worker that dies is started again with the same role.

import cluster from "node:cluster"
import { createRequire } from "node:module"
import { availableParallelism } from "node:os"
import {
  routeMessage,
  WORKER_ROLE_ENV,
  WORKERS_ENV,
  workerCount,
} from "./cluster-protocol.mjs"

/** Delay before starting a worker that died, to avoid a crash loop. */
const RESTART_DELAY_MS = 1000

/** Time the workers get to finish their requests on shutdown. */
const SHUTDOWN_TIMEOUT_MS = 10_000

/**
 * Writes one log line in the same JSON format as the app logger. This
 * file runs outside the Next.js bundle, before the app is loaded, so it
 * cannot import the TypeScript logger; the console writes the structured
 * line to the container output, the same sink the logger uses.
 *
 * @param {"info" | "warn" | "error"} level - Severity.
 * @param {string} message - Message.
 * @param {Record<string, unknown>} [fields] - Extra fields.
 */
function log(level, message, fields = {}) {
  const line = JSON.stringify({
    timestamp: new Date().toISOString(),
    level,
    message,
    ...fields,
  })
  if (level === "info") console.log(line)
  else console.error(line)
}

if (cluster.isPrimary) {
  // Structured clone keeps values JSON cannot carry (e.g. Infinity)
  cluster.setupPrimary({ serialization: "advanced" })
  const count = workerCount(process.env[WORKERS_ENV], availableParallelism())
  /** @type {Map<number, string>} */
  const roles = new Map()
  /** @type {number | null} */
  let coordinatorId = null
  let shuttingDown = false

  const liveIds = () =>
    Object.values(cluster.workers ?? {})
      .filter((worker) => worker && !worker.isDead())
      .map((worker) => /** @type {import("node:cluster").Worker} */ (worker).id)

  /**
   * Starts one worker with a role.
   *
   * @param {string} role - "coordinator" or "worker".
   */
  const fork = (role) => {
    const worker = cluster.fork({ [WORKER_ROLE_ENV]: role })
    roles.set(worker.id, role)
    if (role === "coordinator") coordinatorId = worker.id
    worker.on("message", (message) => {
      for (const delivery of routeMessage(
        message,
        worker.id,
        liveIds(),
        coordinatorId
      )) {
        cluster.workers?.[delivery.to]?.send(delivery.message)
      }
    })
  }

  fork("coordinator")
  for (let i = 1; i < count; i++) fork("worker")
  log("info", "app cluster started", { workers: count })

  cluster.on("exit", (worker, code, signal) => {
    const role = roles.get(worker.id) ?? "worker"
    roles.delete(worker.id)
    if (worker.id === coordinatorId) coordinatorId = null
    if (shuttingDown) {
      if (liveIds().length === 0) process.exit(0)
      return
    }
    log("error", "app worker exited, restarting", { role, code, signal })
    setTimeout(() => {
      if (!shuttingDown) fork(role)
    }, RESTART_DELAY_MS)
  })

  for (const signal of /** @type {const} */ (["SIGTERM", "SIGINT"])) {
    process.on(signal, () => {
      if (shuttingDown) return
      shuttingDown = true
      log("info", "app cluster stopping", { signal })
      for (const worker of Object.values(cluster.workers ?? {})) {
        worker?.process.kill(signal)
      }
      if (liveIds().length === 0) process.exit(0)
      setTimeout(() => process.exit(0), SHUTDOWN_TIMEOUT_MS).unref()
    })
  }
} else {
  // The standalone server sits two folders up (/app/server.js)
  const require = createRequire(import.meta.url)
  require("../../server.js")
}
