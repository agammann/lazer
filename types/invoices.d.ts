declare module 'invoices' {
  /** Fields used from a verified BOLT11 payment request. */
  export function parsePaymentRequest(args: { request: string }): {
    destination: string;
    expires_at: string;
    id?: string;
    mtokens: string;
    network: string;
  };
}
