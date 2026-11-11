/** Mercado Pago JS SDK v2, loaded only on the payment page (RF28). */
export const MERCADO_PAGO_SDK_URL = "https://sdk.mercadopago.com/js/v2"

/** A mounted Brick. */
export type BrickController = {
  /** Removes the Brick from the page. */
  unmount: () => void
}

/** Form data the Payment Brick hands to `onSubmit` (token, never the card). */
export type BrickSubmit = {
  /** Method group chosen in the Brick, e.g. "credit_card". */
  selectedPaymentMethod?: string
  /** Data to send to the server action. */
  formData: Record<string, unknown>
}

/** Bricks builder of the SDK. */
export type BricksBuilder = {
  /**
   * Mounts a Brick in a container.
   *
   * @param brick - "payment" or "statusScreen".
   * @param containerId - Id of the element that receives the Brick.
   * @param settings - Initialization, customization and callbacks.
   * @returns The controller.
   */
  create: (
    brick: "payment" | "statusScreen",
    containerId: string,
    settings: Record<string, unknown>
  ) => Promise<BrickController>
}

/** Instance of the SDK. */
type MercadoPagoInstance = { bricks: () => BricksBuilder }

declare global {
  interface Window {
    /** Constructor added by the SDK script. */
    MercadoPago?: new (
      publicKey: string,
      options?: { locale?: string }
    ) => MercadoPagoInstance
  }
}

/**
 * Creates the Bricks builder once the SDK script loaded.
 *
 * @param publicKey - Public key of the sandbox application.
 * @returns The builder, or null when the SDK is not available.
 */
export function createBricksBuilder(publicKey: string): BricksBuilder | null {
  if (typeof window === "undefined" || !window.MercadoPago) return null
  return new window.MercadoPago(publicKey, { locale: "pt-BR" }).bricks()
}
