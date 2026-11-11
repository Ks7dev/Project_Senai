/** Maximum number of products in the comparison (RF04). */
export const MAX_COMPARE = 4

/** A product chosen for comparison. */
export type CompareItem = { slug: string; name: string }

const STORAGE_KEY = "atelier-bureau:compare"
const EMPTY: CompareItem[] = []
let items: CompareItem[] | null = null
const listeners = new Set<() => void>()

/**
 * Reads the comparison from localStorage, so it survives navigation and
 * reloads (RF04). Invalid stored data is ignored.
 *
 * @returns The stored items.
 */
function read(): CompareItem[] {
  if (items) return items
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]")
    items = Array.isArray(parsed)
      ? parsed
          .filter(
            (item): item is CompareItem =>
              typeof item?.slug === "string" && typeof item?.name === "string"
          )
          .slice(0, MAX_COMPARE)
      : []
  } catch {
    items = []
  }
  return items
}

/**
 * Saves the comparison and notifies subscribers.
 *
 * @param next - New items.
 */
function write(next: CompareItem[]) {
  items = next
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  } catch {
    // Storage blocked (private mode): the comparison lives in memory
  }
  listeners.forEach((listener) => listener())
}

/**
 * Subscribes to comparison changes (for useSyncExternalStore).
 *
 * @param listener - Re-render callback.
 * @returns Unsubscribe function.
 */
export function subscribeCompare(listener: () => void) {
  listeners.add(listener)
  const onStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY) {
      items = null
      listener()
    }
  }
  window.addEventListener("storage", onStorage)
  return () => {
    listeners.delete(listener)
    window.removeEventListener("storage", onStorage)
  }
}

/**
 * Current comparison on the client.
 *
 * @returns Items.
 */
export function getCompareSnapshot(): CompareItem[] {
  return read()
}

/**
 * Comparison on the server render (always empty).
 *
 * @returns An empty list.
 */
export function getCompareServerSnapshot(): CompareItem[] {
  return EMPTY
}

/**
 * Adds or removes a product. Refuses a fifth product (RF04).
 *
 * @param item - Product to toggle.
 * @returns "added", "removed" or "limit" when the comparison is full.
 */
export function toggleCompare(
  item: CompareItem
): "added" | "removed" | "limit" {
  const current = read()
  if (current.some((entry) => entry.slug === item.slug)) {
    write(current.filter((entry) => entry.slug !== item.slug))
    return "removed"
  }
  if (current.length >= MAX_COMPARE) return "limit"
  write([...current, item])
  return "added"
}

/**
 * Removes every product from the comparison.
 */
export function clearCompare() {
  write([])
}
