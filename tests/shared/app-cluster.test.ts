import { EventEmitter } from "node:events"
import { describe, expect, it, vi } from "vitest"
import { createClusterCacheHandler } from "@/deploy/app/cache-handler.mjs"
import {
  DEFAULT_WORKERS,
  MESSAGE_TYPES,
  routeMessage,
  workerCount,
} from "@/deploy/app/cluster-protocol.mjs"
import {
  clusterRole,
  runsBackgroundTasks,
} from "@/features/shared/lib/cluster/cluster-role"
import { logger } from "@/features/shared/lib/logger/logger"
import { RateLimiter } from "@/features/shared/lib/rate-limit/rate-limit"
import {
  checkSharedRateLimit,
  startRateLimitCoordinator,
  type IpcChannel,
} from "@/features/shared/lib/rate-limit/shared-limit"

/** IPC channel of a test worker: records what it sends. */
class FakeChannel extends EventEmitter implements IpcChannel {
  sent: unknown[] = []
  onSend?: (message: unknown) => void

  /**
   * Records a message sent to the primary.
   *
   * @param message - The message.
   * @returns True, like `process.send`.
   */
  send(message: unknown) {
    this.sent.push(message)
    this.onSend?.(message)
    return true
  }
}

/**
 * Connects two channels the way the cluster primary does, using the
 * real routing of `cluster-protocol.mjs`.
 *
 * @param worker - Channel of an ordinary worker (id 2).
 * @param coordinator - Channel of the coordinator (id 1).
 */
function connect(worker: FakeChannel, coordinator: FakeChannel) {
  const channels = new Map([
    [1, coordinator],
    [2, worker],
  ])
  for (const [id, channel] of channels) {
    channel.onSend = (message) => {
      for (const delivery of routeMessage(message, id, [1, 2], 1)) {
        channels.get(delivery.to)?.emit("message", delivery.message)
      }
    }
  }
}

const rule = { limit: 2, windowMs: 60_000 }

describe("cluster size (#79)", () => {
  it("uses APP_WORKERS, the default and the CPU limit", () => {
    expect(workerCount("3", 12)).toBe(3)
    expect(workerCount(undefined, 12)).toBe(DEFAULT_WORKERS)
    expect(workerCount("abc", 12)).toBe(DEFAULT_WORKERS)
    expect(workerCount("0", 12)).toBe(DEFAULT_WORKERS)
    expect(workerCount("16", 6)).toBe(6)
    expect(workerCount("4", 0)).toBe(1)
  })
})

describe("message routing of the primary (#79)", () => {
  it("sends a cache revalidation to every other worker", () => {
    const message = { type: MESSAGE_TYPES.cacheTags, tags: ["products"] }
    expect(routeMessage(message, 2, [1, 2, 3], 1)).toEqual([
      { to: 1, message },
      { to: 3, message },
    ])
  })

  it("forwards a rate limit check to the coordinator and the answer back", () => {
    const check = { type: MESSAGE_TYPES.rateLimit, requestId: "r1" }
    expect(routeMessage(check, 3, [1, 2, 3], 1)).toEqual([
      { to: 1, message: { ...check, from: 3 } },
    ])
    const answer = {
      type: MESSAGE_TYPES.rateLimitResult,
      requestId: "r1",
      to: 3,
    }
    expect(routeMessage(answer, 1, [1, 2, 3], 1)).toEqual([
      { to: 3, message: answer },
    ])
    expect(routeMessage({ ...answer, to: 9 }, 1, [1, 2, 3], 1)).toEqual([])
  })

  it("answers with no result while the coordinator restarts", () => {
    const check = { type: MESSAGE_TYPES.rateLimit, requestId: "r2" }
    expect(routeMessage(check, 2, [2, 3], null)).toEqual([
      {
        to: 2,
        message: {
          type: MESSAGE_TYPES.rateLimitResult,
          requestId: "r2",
          result: null,
        },
      },
    ])
  })

  it("ignores unknown messages", () => {
    expect(routeMessage("hello", 1, [1, 2], 1)).toEqual([])
    expect(routeMessage({ type: "other" }, 1, [1, 2], 1)).toEqual([])
    expect(routeMessage(null, 1, [1, 2], 1)).toEqual([])
  })
})

describe("worker role (#79)", () => {
  it("runs the background work only once per server", () => {
    expect(clusterRole({})).toBe("standalone")
    expect(clusterRole({ APP_WORKER_ROLE: "coordinator" })).toBe("coordinator")
    expect(clusterRole({ APP_WORKER_ROLE: "worker" })).toBe("worker")
    expect(clusterRole({ APP_WORKER_ROLE: "x" })).toBe("standalone")
    expect(runsBackgroundTasks({})).toBe(true)
    expect(runsBackgroundTasks({ APP_WORKER_ROLE: "coordinator" })).toBe(true)
    expect(runsBackgroundTasks({ APP_WORKER_ROLE: "worker" })).toBe(false)
  })
})

describe("rate limit shared by the workers (RNF05, #79)", () => {
  it("counts in memory outside a cluster", async () => {
    const limiter = new RateLimiter(() => 0)
    const options = { role: "standalone" as const, channel: null, limiter }
    expect((await checkSharedRateLimit("ip", rule, options)).allowed).toBe(true)
    expect((await checkSharedRateLimit("ip", rule, options)).allowed).toBe(true)
    expect((await checkSharedRateLimit("ip", rule, options)).allowed).toBe(
      false
    )
  })

  it("counts every worker against the coordinator counters", async () => {
    const worker = new FakeChannel()
    const coordinator = new FakeChannel()
    connect(worker, coordinator)
    const shared = new RateLimiter(() => 0)
    const local = new RateLimiter(() => 0)
    expect(
      startRateLimitCoordinator({
        role: "coordinator",
        channel: coordinator,
        limiter: shared,
      })
    ).toBe(true)
    // Started once per channel
    expect(
      startRateLimitCoordinator({
        role: "coordinator",
        channel: coordinator,
        limiter: shared,
      })
    ).toBe(false)

    // One hit on the coordinator itself, one through the worker
    expect(shared.check("ip", rule).allowed).toBe(true)
    const options = { role: "worker" as const, channel: worker, limiter: local }
    expect((await checkSharedRateLimit("ip", rule, options)).allowed).toBe(true)
    const blocked = await checkSharedRateLimit("ip", rule, options)
    expect(blocked.allowed).toBe(false)
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0)
    // The worker never counted in its own memory
    expect(local.check("ip", rule).remaining).toBe(1)
  })

  it("falls back to its own counter when the coordinator is silent", async () => {
    vi.useFakeTimers()
    const warn = vi.spyOn(logger, "warn").mockImplementation(() => undefined)
    try {
      const worker = new FakeChannel()
      const local = new RateLimiter(() => 0)
      const pending = checkSharedRateLimit("ip", rule, {
        role: "worker",
        channel: worker,
        limiter: local,
        timeoutMs: 50,
      })
      await vi.advanceTimersByTimeAsync(50)
      const result = await pending
      expect(result.allowed).toBe(true)
      expect(result.remaining).toBe(1)
      expect(worker.sent).toHaveLength(1)
      // The fallback is visible in the log
      expect(warn).toHaveBeenCalledWith(
        "shared rate limit unavailable, counting in this worker"
      )
    } finally {
      warn.mockRestore()
      vi.useRealTimers()
    }
  })

  it("does not answer outside the coordinator", () => {
    expect(
      startRateLimitCoordinator({ role: "worker", channel: new FakeChannel() })
    ).toBe(false)
    expect(
      startRateLimitCoordinator({ role: "coordinator", channel: null })
    ).toBe(false)
  })
})

describe("cache revalidation across workers (#79)", () => {
  /**
   * In-memory handler double that records the revalidated tags.
   *
   * @returns The double.
   */
  function fakeLocal() {
    return {
      get: vi.fn(async () => undefined),
      set: vi.fn(async () => undefined),
      refreshTags: vi.fn(async () => undefined),
      getExpiration: vi.fn(async () => 0),
      updateTags: vi.fn(async () => undefined),
    }
  }

  it("sends a revalidated tag to the other workers", async () => {
    const local = fakeLocal()
    const incremental = vi.fn(async () => undefined)
    const channel = new FakeChannel()
    const handler = createClusterCacheHandler({ local, channel, incremental })
    await handler.updateTags(["products"], { expire: 100 })
    // Next.js itself updates the incremental cache of the sending worker
    expect(incremental).not.toHaveBeenCalled()
    expect(local.updateTags).toHaveBeenCalledWith(["products"], {
      expire: 100,
    })
    expect(channel.sent).toEqual([
      {
        type: MESSAGE_TYPES.cacheTags,
        tags: ["products"],
        durations: { expire: 100 },
      },
    ])
  })

  it("applies a revalidation from another worker to both caches", async () => {
    const { tagsManifest, areTagsExpired, areTagsStale } =
      await import("next/dist/server/lib/incremental-cache/tags-manifest.external.js")
    const before = Date.now() - 1000
    // The real incremental cache manifest of this process, as Next.js
    // reads it to decide whether a prerendered shell is still valid
    const channel = new FakeChannel()
    createClusterCacheHandler({ local: fakeLocal(), channel })
    channel.emit("message", {
      type: MESSAGE_TYPES.cacheTags,
      tags: ["test-expired"],
    })
    channel.emit("message", {
      type: MESSAGE_TYPES.cacheTags,
      tags: ["test-stale"],
      durations: { expire: 3600 },
    })
    await vi.waitFor(() => {
      expect(areTagsExpired(["test-expired"], before)).toBe(true)
      expect(areTagsStale(["test-stale"], before)).toBe(true)
    })
    expect(areTagsExpired(["test-stale"], before)).toBe(false)
    tagsManifest.delete("test-expired")
    tagsManifest.delete("test-stale")
  })

  it("applies a revalidation from another worker without sending it back", () => {
    const local = fakeLocal()
    const incremental = vi.fn(async () => undefined)
    const channel = new FakeChannel()
    createClusterCacheHandler({ local, channel, incremental })
    channel.emit("message", {
      type: MESSAGE_TYPES.cacheTags,
      tags: ["categories"],
    })
    channel.emit("message", { type: "other", tags: ["x"] })
    expect(local.updateTags).toHaveBeenCalledTimes(1)
    expect(local.updateTags).toHaveBeenCalledWith(["categories"], undefined)
    expect(incremental).toHaveBeenCalledTimes(1)
    expect(incremental).toHaveBeenCalledWith(["categories"], undefined)
    expect(channel.sent).toEqual([])
  })

  it("delegates reads and writes to the in-memory cache", async () => {
    const local = fakeLocal()
    const handler = createClusterCacheHandler({
      local,
      channel: new EventEmitter(),
    })
    await handler.get("key", ["tag"])
    await handler.refreshTags()
    await handler.getExpiration(["tag"])
    const entry = Promise.resolve({
      value: new ReadableStream<Uint8Array>(),
      tags: [],
      stale: 0,
      timestamp: 0,
      expire: 0,
      revalidate: 0,
    })
    await handler.set("key", entry)
    expect(local.get).toHaveBeenCalledWith("key", ["tag"])
    expect(local.set).toHaveBeenCalledWith("key", entry)
    expect(local.refreshTags).toHaveBeenCalled()
    expect(local.getExpiration).toHaveBeenCalledWith(["tag"])
    // No IPC channel: nothing to broadcast
    await expect(handler.updateTags(["tag"])).resolves.toBeUndefined()
  })
})
