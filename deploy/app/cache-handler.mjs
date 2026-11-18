// "use cache" handler of the app workers (issue #79, RNF02). It keeps
// the built-in in-memory cache of Next.js and only adds one thing: a
// tag revalidated in one worker (e.g. the back office saved a product)
// is sent to the other workers through the cluster primary, so every
// worker drops the stale catalog at the same time. Outside the cluster
// (`next dev`, `next build`, tests) there is no IPC channel and it
// behaves exactly like the built-in handler.

import defaultHandlers from "next/dist/server/lib/cache-handlers/default.js"
import { MESSAGE_TYPES } from "./cluster-protocol.mjs"

// CommonJS module of Next.js: read the factory from its exports
const { createDefaultCacheHandler } = defaultHandlers

/** Memory of the cache, same as the Next.js default (50 MB). */
const MAX_MEMORY_BYTES = 50 * 1024 * 1024

/**
 * Creates the cache handler.
 *
 * @param {object} [options] - Dependencies, replaceable in tests.
 * @param {import("next/dist/server/lib/cache-handlers/types").CacheHandler} [options.local]
 *   - In-memory handler that stores the entries.
 * @param {{ send?: (message: unknown) => unknown, on: (event: "message", listener: (message: unknown) => void) => unknown }} [options.channel]
 *   - IPC channel with the cluster primary (the process by default).
 * @returns {import("next/dist/server/lib/cache-handlers/types").CacheHandler}
 *   The handler.
 */
export function createClusterCacheHandler({
  local = createDefaultCacheHandler(MAX_MEMORY_BYTES),
  channel = process,
} = {}) {
  const send =
    typeof channel.send === "function" ? channel.send.bind(channel) : null

  if (send) {
    channel.on("message", (message) => {
      if (
        message &&
        typeof message === "object" &&
        /** @type {{ type?: unknown }} */ (message).type ===
          MESSAGE_TYPES.cacheTags
      ) {
        const { tags, durations } =
          /** @type {{ tags: string[], durations?: { expire?: number } }} */ (
            message
          )
        // Applied locally only: never sent back, so there is no loop
        void local.updateTags(tags, durations)
      }
    })
  }

  return {
    get: (cacheKey, softTags) => local.get(cacheKey, softTags),
    set: (cacheKey, pendingEntry) => local.set(cacheKey, pendingEntry),
    refreshTags: () => local.refreshTags(),
    getExpiration: (tags) => local.getExpiration(tags),
    async updateTags(tags, durations) {
      await local.updateTags(tags, durations)
      send?.({ type: MESSAGE_TYPES.cacheTags, tags, durations })
    },
  }
}

export default createClusterCacheHandler()
