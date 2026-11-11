import { z } from "zod"
import { formatCep } from "@/features/shared/schema/cep-schema"

/** Address copied to the order, so later edits never change it. */
export type AddressSnapshot = {
  /** Saved address id it came from. */
  addressId: string
  /** Nickname, e.g. "Matriz". */
  label: string
  /** Who receives. */
  recipient: string
  /** CEP, 8 digits. */
  cep: string
  /** Street. */
  street: string
  /** Number. */
  number: string
  /** Complement, if any. */
  complement: string | null
  /** District. */
  district: string
  /** City. */
  city: string
  /** State (UF). */
  state: string
}

const lineSchema = z
  .object({
    cep: z.string().optional(),
    street: z.string().optional(),
    number: z.string().optional(),
    complement: z.string().nullable().optional(),
    district: z.string().optional(),
    city: z.string().optional(),
    state: z.string().optional(),
  })
  .passthrough()

/**
 * Builds the order snapshot of a saved address.
 *
 * @param address - Saved address row.
 * @returns The snapshot.
 */
export function toAddressSnapshot(
  address: Omit<AddressSnapshot, "addressId"> & { id: string }
): AddressSnapshot {
  return {
    addressId: address.id,
    label: address.label,
    recipient: address.recipient,
    cep: address.cep,
    street: address.street,
    number: address.number,
    complement: address.complement,
    district: address.district,
    city: address.city,
    state: address.state,
  }
}

/**
 * One-line description of an address snapshot or a saved address.
 *
 * @param value - Address fields (unknown JSON from the order is fine).
 * @returns "Rua, 10 – Sala 2 · Bairro · Cidade/UF · CEP 00000-000".
 */
export function addressLine(value: unknown): string {
  const parsed = lineSchema.safeParse(value)
  if (!parsed.success) return "—"
  const { cep, street, number, complement, district, city, state } = parsed.data
  const parts = [
    street
      ? `${street}${number ? `, ${number}` : ""}${complement ? ` – ${complement}` : ""}`
      : null,
    district || null,
    city ? `${city}${state ? `/${state}` : ""}` : null,
    cep ? `CEP ${formatCep(cep)}` : null,
  ].filter(Boolean)
  return parts.length > 0 ? parts.join(" · ") : "—"
}
