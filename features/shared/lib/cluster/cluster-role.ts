import { WORKER_ROLE_ENV } from "@/deploy/app/cluster-protocol.mjs"

/**
 * Role of this process in the app cluster (#79, RNF02):
 * - `standalone`: a single process (`next dev`, `next start`, tests).
 * - `coordinator`: the cluster worker that runs the background jobs and
 *   holds the shared rate limit counters.
 * - `worker`: any other cluster worker, which only serves requests.
 */
export type ClusterRole = "standalone" | "coordinator" | "worker"

/** Environment variables read by the cluster helpers. */
export type ClusterEnvironment = Readonly<Record<string, string | undefined>>

/**
 * Reads the role of this process, set by the cluster launcher
 * (`deploy/app/cluster.mjs`).
 *
 * @param env - Environment variables (defaults to `process.env`).
 * @returns The role.
 */
export function clusterRole(
  env: ClusterEnvironment = process.env
): ClusterRole {
  const value = env[WORKER_ROLE_ENV]
  return value === "coordinator" || value === "worker" ? value : "standalone"
}

/**
 * Whether this process runs the work that must happen once per server:
 * the background jobs (RN14, RF53) and the legacy data encryption
 * (RNF03). Only the standalone process or the cluster coordinator do.
 *
 * @param env - Environment variables (defaults to `process.env`).
 * @returns Whether to run them here.
 */
export function runsBackgroundTasks(
  env: ClusterEnvironment = process.env
): boolean {
  return clusterRole(env) !== "worker"
}
