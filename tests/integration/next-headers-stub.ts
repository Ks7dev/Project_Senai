/**
 * Stand-in for `next/headers` in the integration tests: a cookie jar
 * shared by `headers()` and `cookies()`, so Better Auth sets the session
 * cookie on sign-in and reads it back on the next action.
 */
export const jar = new Map<string, string>()

/**
 * Request headers with the cookies of the jar.
 *
 * @returns Headers.
 */
export async function headers() {
  const cookie = [...jar].map(([name, value]) => `${name}=${value}`)
  return new Headers(cookie.length ? { cookie: cookie.join("; ") } : {})
}

/**
 * Cookie store backed by the jar.
 *
 * @returns The store.
 */
export async function cookies() {
  return {
    get: (name: string) =>
      jar.has(name) ? { name, value: jar.get(name)! } : undefined,
    getAll: () => [...jar].map(([name, value]) => ({ name, value })),
    has: (name: string) => jar.has(name),
    set: (name: string | { name: string; value: string }, value?: string) => {
      if (typeof name === "object") jar.set(name.name, name.value)
      else if (value === "") jar.delete(name)
      else jar.set(name, value ?? "")
    },
    delete: (name: string) => jar.delete(name),
  }
}
