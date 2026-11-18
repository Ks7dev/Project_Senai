/** Mercado Pago JS SDK v2, loaded only on the payment page (RF28). */
export const MERCADO_PAGO_SDK_URL = "https://sdk.mercadopago.com/js/v2"

/**
 * Mercado Pago security script (#232), loaded with `view="checkout"` on
 * the payment page. It creates the buyer `device_id` in the global
 * `MP_DEVICE_SESSION_ID`, sent in `X-meli-session-id` when the payment
 * is created, which helps the fraud analysis approve more payments.
 */
export const MERCADO_PAGO_SECURITY_URL =
  "https://www.mercadopago.com/v2/security.js"

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
    /** Device id created by the security script (#232). */
    MP_DEVICE_SESSION_ID?: unknown
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

/**
 * Device id created by the Mercado Pago security script (#232), if it
 * already ran. The server validates the format again.
 *
 * @returns The device id, or undefined.
 */
export function readDeviceSessionId(): string | undefined {
  if (typeof window === "undefined") return undefined
  const value = window.MP_DEVICE_SESSION_ID
  return typeof value === "string" && value ? value : undefined
}
