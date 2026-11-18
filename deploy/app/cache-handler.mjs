// "use cache" handler of the app workers (issue #79, RNF02). It keeps
// the built-in in-memory cache of Next.js and only adds one thing: a
// tag revalidated in one worker (e.g. the back office saved a product)
// is sent to the other workers through the cluster primary, so every
// worker drops the stale catalog at the same time. The tag is applied to
// both caches a local `revalidateTag` touches: the "use cache" entries
// and the tag manifest of the incremental (ISR) cache, which is also an
// in-memory map per process. Outside the cluster
// (`next dev`, `next build`, tests) there is no IPC channel and it
// behaves exactly like the built-in handler.

import defaultHandlers from "next/dist/server/lib/cache-handlers/default.js"
import fileSystemCacheModule from "next/dist/server/lib/incremental-cache/file-system-cache.js"
import { MESSAGE_TYPES } from "./cluster-protocol.mjs"

// CommonJS modules of Next.js: read the exports
const { createDefaultCacheHandler } = defaultHandlers
// Node.js gives `module.exports`; bundlers and Vitest may already give
// its `default` export
const FileSystemCache = fileSystemCacheModule.default ?? fileSystemCacheModule

/**
 * Applies revalidated tags to the tag manifest of the incremental cache
 * of this process, exactly as Next.js does for a local `revalidateTag`
 * (the built-in file system cache keeps the manifest in a module-level
 * map, so the method needs no instance).
 *
 * @param {string[]} tags - Revalidated tags.
 * @param {{ expire?: number }} [durations] - Cache life of the profile.
 * @returns {Promise<void>} When applied.
 */
function revalidateIncrementalTags(tags, durations) {
  return FileSystemCache.prototype.revalidateTag.call(null, tags, durations)
}

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
 * @param {(tags: string[], durations?: { expire?: number }) => Promise<void>} [options.incremental]
 *   - Applies the tags to the incremental (ISR) cache of this process.
 * @returns {import("next/dist/server/lib/cache-handlers/types").CacheHandler}
 *   The handler.
 */
export function createClusterCacheHandler({
  local = createDefaultCacheHandler(MAX_MEMORY_BYTES),
  channel = process,
  incremental = revalidateIncrementalTags,
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
        void incremental(tags, durations)
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
