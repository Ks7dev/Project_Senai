import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  hkdfSync,
} from "node:crypto"

// No "server-only" import: the seed and the encryption script also use
// this module. The key lives only in the server environment.

/** Prefix of an encrypted value; a value without it is legacy plain text. */
const PREFIX = "v1."

/** Key used outside production when DATA_ENCRYPTION_KEY is not set. */
const DEV_KEY = "atelier-bureau-dev-only-personal-data-key"

/** Derived keys: one encrypts, the other builds the deterministic IV. */
type Keys = { enc: Buffer; iv: Buffer }

let cached: { source: string; keys: Keys } | null = null

/**
 * Reads the master key from `DATA_ENCRYPTION_KEY` (32 bytes in base64)
 * and derives the encryption and IV keys with HKDF. Production refuses
 * to run without the variable; development and tests fall back to a
 * fixed key, so a fresh clone works without setup.
 *
 * @returns The derived keys.
 * @throws Error when the key is missing in production or is not 32 bytes.
 */
function keys(): Keys {
  const configured = process.env.DATA_ENCRYPTION_KEY?.trim()
  if (!configured && process.env.NODE_ENV === "production") {
    throw new Error("DATA_ENCRYPTION_KEY is not set")
  }
  const source = configured || DEV_KEY
  if (cached?.source === source) return cached.keys
  const master = configured
    ? Buffer.from(configured, "base64")
    : Buffer.from(DEV_KEY)
  if (configured && master.length !== 32) {
    throw new Error("DATA_ENCRYPTION_KEY must be 32 bytes in base64")
  }
  const derive = (info: string) =>
    Buffer.from(hkdfSync("sha256", master, "", info, 32))
  const derived = {
    enc: derive("personal-data:enc"),
    iv: derive("personal-data:iv"),
  }
  cached = { source, keys: derived }
  return derived
}

/**
 * Tells whether a stored value is already encrypted.
 *
 * @param value - Stored value.
 * @returns True for a value made by `encryptPersonal`.
 */
export function isEncryptedPersonal(value: string): boolean {
  return value.startsWith(PREFIX)
}

/**
 * Encrypts a personal datum (CPF, phone) for storage (RNF03), with
 * AES-256-GCM. The IV is an HMAC of the value, so the same value always
 * gives the same ciphertext: the unique index on the CPF keeps working
 * and a lookup encrypts the searched value and compares. An already
 * encrypted value is returned as is.
 *
 * @param value - Plain value.
 * @returns `v1.` followed by IV, ciphertext and tag in base64url.
 */
export function encryptPersonal(value: string): string {
  if (isEncryptedPersonal(value)) return value
  const { enc, iv: ivKey } = keys()
  const iv = createHmac("sha256", ivKey).update(value).digest().subarray(0, 12)
  const cipher = createCipheriv("aes-256-gcm", enc, iv)
  const body = Buffer.concat([cipher.update(value, "utf8"), cipher.final()])
  const tag = cipher.getAuthTag()
  return PREFIX + Buffer.concat([iv, body, tag]).toString("base64url")
}

/**
 * Encrypts an optional personal datum, keeping empty values empty.
 *
 * @param value - Plain value, empty or null.
 * @returns The encrypted value, or the same empty value.
 */
export function encryptPersonalOptional<T extends string | null | undefined>(
  value: T
): T | string {
  return value ? encryptPersonal(value) : value
}

/**
 * Decrypts a stored personal datum. Plain values written before the
 * encryption (or placeholders such as the anonymized CPF) are returned
 * as they are.
 *
 * @param value - Stored value.
 * @returns The plain value.
 * @throws Error when the value was changed or the key is wrong.
 */
export function decryptPersonal<T extends string | null | undefined>(
  value: T
): T | string {
  if (!value || !isEncryptedPersonal(value)) return value
  const raw = Buffer.from(value.slice(PREFIX.length), "base64url")
  const decipher = createDecipheriv(
    "aes-256-gcm",
    keys().enc,
    raw.subarray(0, 12)
  )
  decipher.setAuthTag(raw.subarray(raw.length - 16))
  return Buffer.concat([
    decipher.update(raw.subarray(12, raw.length - 16)),
    decipher.final(),
  ]).toString("utf8")
}
