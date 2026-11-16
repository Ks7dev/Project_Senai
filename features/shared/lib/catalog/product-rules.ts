/**
 * Whether the price includes the extended warranty (RN06): products
 * above the configured threshold get it automatically, at no extra cost.
 *
 * @param price - Product base price.
 * @param threshold - Value of "product.extended_warranty_threshold".
 * @returns True when the extended warranty is included.
 */
export function includesExtendedWarranty(
  price: number,
  threshold: number
): boolean {
  return price > threshold
}

/** Product data needed to decide whether it can be published. */
export type PublishCheck = {
  /** Product requires a regulatory certification (NR, INMETRO). */
  requiresCertification: boolean
  /** Number of CERTIFICATION documents attached. */
  certificationDocuments: number
  /** Number of active SKUs. */
  activeSkus: number
}

/**
 * Explains why a product cannot be published, or returns null when it
 * can (RN09: certification document required; at least one SKU).
 *
 * @param product - Publish data.
 * @returns The blocking reason in Portuguese, or null.
 */
export function publishBlocker(product: PublishCheck): string | null {
  if (product.requiresCertification && product.certificationDocuments === 0) {
    return "Anexe o documento de certificação antes de publicar este produto."
  }
  if (product.activeSkus === 0) {
    return "Cadastre ao menos uma variação (SKU) ativa antes de publicar."
  }
  return null
}
