import "server-only"
import { mkdir, readFile, rm, writeFile } from "node:fs/promises"
import { dirname, join, normalize, sep } from "node:path"

/**
 * Root folder of uploaded files (images, datasheets, attachments). Local
 * disk on the server, mounted as a volume in Docker; the database keeps
 * only the key (ARCHITECTURE.md, section 1).
 *
 * @returns The absolute storage root.
 */
export function storageRoot(): string {
  return process.env.STORAGE_DIR ?? join(process.cwd(), "storage", "uploads")
}

/**
 * Resolves a storage key to an absolute path, refusing keys that would
 * escape the storage root (path traversal).
 *
 * @param key - Key such as "products/<id>/<image>-640.webp".
 * @returns The absolute path.
 */
export function resolveStorageKey(key: string): string {
  if (!/^[a-z0-9][a-z0-9/_.-]*$/i.test(key) || key.includes("..")) {
    throw new Error("Invalid storage key")
  }
  const root = normalize(storageRoot())
  const path = normalize(join(root, key))
  if (!path.startsWith(root + sep)) throw new Error("Invalid storage key")
  return path
}

/**
 * Saves a file under a storage key.
 *
 * @param key - Destination key.
 * @param data - File contents.
 */
export async function saveFile(key: string, data: Buffer): Promise<void> {
  const path = resolveStorageKey(key)
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, data)
}

/**
 * Reads a stored file.
 *
 * @param key - Storage key.
 * @returns The contents, or null when the file does not exist.
 */
export async function readStoredFile(key: string): Promise<Buffer | null> {
  try {
    return await readFile(resolveStorageKey(key))
  } catch {
    return null
  }
}

/**
 * Deletes a stored file; missing files are ignored.
 *
 * @param key - Storage key.
 */
export async function deleteFile(key: string): Promise<void> {
  await rm(resolveStorageKey(key), { force: true })
}

/**
 * Public URL of a stored file, served by the /media route.
 *
 * @param key - Storage key.
 * @returns The URL path.
 */
export function mediaUrl(key: string): string {
  return `/media/${key}`
}
