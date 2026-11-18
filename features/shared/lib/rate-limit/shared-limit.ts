import { randomUUID } from "node:crypto"
import { MESSAGE_TYPES } from "@/deploy/app/cluster-protocol.mjs"
import {
  clusterRole,
  type ClusterRole,
} from "@/features/shared/lib/cluster/cluster-role"
import {
  RateLimiter,
  type RateLimitResult,
  type RateLimitRule,
} from "@/features/shared/lib/rate-limit/rate-limit"

/**
 * IPC channel with the cluster primary. In a cluster worker it is the
 * process itself (`process.send` and its `message` event).
 */
export type IpcChannel = {
  /** Sends a message to the primary. */
  send: (message: unknown) => unknown
  /** Listens to the messages relayed by the primary. */
  on: (event: "message", listener: (message: unknown) => void) => unknown
}

/** How long a worker waits for the coordinator before counting alone. */
const COORDINATOR_TIMEOUT_MS = 250

type RateLimitRequest = {
  type: string
  requestId: string
  key: string
  rule: RateLimitRule
  from?: number
}

type RateLimitReply = {
  type: string
  requestId: string
  result: RateLimitResult | null
}

type PendingReplies = Map<string, (result: RateLimitResult | null) => void>

const globalForLimiter = globalThis as unknown as {
  atelierRateLimiter?: RateLimiter
  atelierRateLimitPending?: WeakMap<IpcChannel, PendingReplies>
  atelierRateLimitCoordinators?: WeakSet<IpcChannel>
}

/**
 * Rate limiter of this process. Shared through `globalThis` because the
 * proxy and the Server Actions are separate bundles in the same process.
 *
 * @returns The limiter.
 */
export function processRateLimiter(): RateLimiter {
  globalForLimiter.atelierRateLimiter ??= new RateLimiter()
  return globalForLimiter.atelierRateLimiter
}

/**
 * IPC channel of this process, or null outside a cluster worker.
 *
 * @returns The channel or null.
 */
function processChannel(): IpcChannel | null {
  return typeof process.send === "function"
    ? (process as unknown as IpcChannel)
    : null
}

/**
 * Tells whether a message is a rate limit reply.
 *
 * @param message - Message received.
 * @returns Whether it is a reply.
 */
function isReply(message: unknown): message is RateLimitReply {
  return (
    !!message &&
    typeof message === "object" &&
    (message as { type?: unknown }).type === MESSAGE_TYPES.rateLimitResult
  )
}

/**
 * Tells whether a message is a rate limit request.
 *
 * @param message - Message received.
 * @returns Whether it is a request.
 */
function isRequest(message: unknown): message is RateLimitRequest {
  return (
    !!message &&
    typeof message === "object" &&
    (message as { type?: unknown }).type === MESSAGE_TYPES.rateLimit
  )
}

/**
 * Pending requests of this worker, with the reply listener installed
 * once per process.
 *
 * @param channel - IPC channel.
 * @returns The pending map.
 */
function pendingReplies(channel: IpcChannel): PendingReplies {
  globalForLimiter.atelierRateLimitPending ??= new WeakMap()
  const byChannel = globalForLimiter.atelierRateLimitPending
  const existing = byChannel.get(channel)
  if (existing) return existing
  const pending: PendingReplies = new Map()
  byChannel.set(channel, pending)
  channel.on("message", (message) => {
    if (!isReply(message)) return
    const resolve = pending.get(message.requestId)
    if (!resolve) return
    pending.delete(message.requestId)
    resolve(message.result)
  })
  return pending
}

/**
 * Counts a request against a rate limit (RNF05) shared by every worker
 * of the app cluster (#79). The standalone process and the coordinator
 * count in their own memory; the other workers ask the coordinator,
 * through the primary. If the coordinator does not answer in time (it
 * may be restarting), the worker counts in its own memory, so the limit
 * still applies.
 *
 * @param key - Who is being limited (route group + client IP).
 * @param rule - Limit and window.
 * @param options - Dependencies, replaceable in tests.
 * @returns Whether it is allowed, remaining slots and retry delay.
 */
export async function checkSharedRateLimit(
  key: string,
  rule: RateLimitRule,
  options: {
    role?: ClusterRole
    channel?: IpcChannel | null
    limiter?: RateLimiter
    timeoutMs?: number
  } = {}
): Promise<RateLimitResult> {
  const role = options.role ?? clusterRole()
  const channel =
    options.channel === undefined ? processChannel() : options.channel
  const limiter = options.limiter ?? processRateLimiter()
  if (role !== "worker" || !channel) return limiter.check(key, rule)

  const pending = pendingReplies(channel)
  const requestId = randomUUID()
  const result = await new Promise<RateLimitResult | null>((resolve) => {
    const timer = setTimeout(() => {
      pending.delete(requestId)
      resolve(null)
    }, options.timeoutMs ?? COORDINATOR_TIMEOUT_MS)
    pending.set(requestId, (reply) => {
      clearTimeout(timer)
      resolve(reply)
    })
    const request: RateLimitRequest = {
      type: MESSAGE_TYPES.rateLimit,
      requestId,
      key,
      rule,
    }
    channel.send(request)
  })
  return result ?? limiter.check(key, rule)
}

/**
 * Makes the coordinator answer the rate limit checks of the other
 * workers with its own counters. Does nothing outside the coordinator
 * and when called again.
 *
 * @param options - Dependencies, replaceable in tests.
 * @returns Whether it started listening now.
 */
export function startRateLimitCoordinator(
  options: {
    role?: ClusterRole
    channel?: IpcChannel | null
    limiter?: RateLimiter
  } = {}
): boolean {
  const role = options.role ?? clusterRole()
  const channel =
    options.channel === undefined ? processChannel() : options.channel
  if (role !== "coordinator" || !channel) return false
  globalForLimiter.atelierRateLimitCoordinators ??= new WeakSet()
  if (globalForLimiter.atelierRateLimitCoordinators.has(channel)) return false
  globalForLimiter.atelierRateLimitCoordinators.add(channel)
  const limiter = options.limiter ?? processRateLimiter()
  channel.on("message", (message) => {
    if (!isRequest(message)) return
    channel.send({
      type: MESSAGE_TYPES.rateLimitResult,
      requestId: message.requestId,
      to: message.from,
      result: limiter.check(message.key, message.rule),
    })
  })
  return true
}
