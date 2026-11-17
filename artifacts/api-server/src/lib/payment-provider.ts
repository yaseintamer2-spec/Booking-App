/**
 * Provider boundary for the later payment phase.
 *
 * The app intentionally does not accept or simulate payments until a provider
 * and its server-side credentials are configured.
 */
export interface PaymentCheckoutRequest {
  bookingId: string;
  amountHalalas: number;
  currency: "SAR";
  idempotencyKey: string;
  returnUrl: string;
}

export interface PaymentCheckoutSession {
  providerReference: string;
  redirectUrl: string;
  expiresAt: Date;
}

export interface VerifiedPaymentEvent {
  providerReference: string;
  bookingId: string;
  amountHalalas: number;
  currency: "SAR";
  status: "paid" | "failed" | "refunded";
}

export interface PaymentProvider {
  createCheckout(
    request: PaymentCheckoutRequest,
  ): Promise<PaymentCheckoutSession>;
  verifyWebhook(
    rawBody: Buffer,
    signature: string | undefined,
  ): Promise<VerifiedPaymentEvent>;
  refund(
    providerReference: string,
    amountHalalas: number,
    idempotencyKey: string,
  ): Promise<{ providerReference: string; status: "refunded" }>;
}
