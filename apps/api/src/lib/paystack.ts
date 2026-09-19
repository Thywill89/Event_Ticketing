import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "../config/env";

const PAYSTACK_BASE = "https://api.paystack.co";

export class PaystackError extends Error {
  status: number;
  code: string;

  constructor(message: string, status: number, code: string) {
    super(message);
    this.name = "PaystackError";
    this.status = status;
    this.code = code;
  }
}

export type PaystackInitializeResult = {
  authorizationUrl: string;
  accessCode: string;
  reference: string;
};

export type PaystackVerifyResult = {
  status: string;
  reference: string;
  amount: number;
  currency: string;
  paidAt: string | null;
  gatewayResponse: string | null;
  metadata: Record<string, unknown> | null;
  raw: unknown;
};

type PaystackApiResponse<T> = {
  status: boolean;
  message: string;
  data: T;
};

/**
 * Convert major currency units (e.g. GHS 50.00) to Paystack subunit
 * (pesewas for GHS, kobo for NGN). Most Paystack currencies use ×100.
 */
export function toPaystackAmount(majorAmount: string | number): number {
  const n = typeof majorAmount === "number" ? majorAmount : Number(majorAmount);
  if (!Number.isFinite(n) || n < 0) {
    throw new PaystackError("Invalid payment amount", 400, "INVALID_AMOUNT");
  }
  return Math.round(n * 100);
}

export function fromPaystackAmount(subunit: number): string {
  return (subunit / 100).toFixed(2);
}

/**
 * Verify Paystack webhook signature (HMAC SHA512 of raw body with secret key).
 * Prefer raw body bytes; falls back to JSON.stringify(parsed) as in Paystack docs.
 */
export function verifyPaystackSignature(
  payload: Buffer | string,
  signatureHeader: string | undefined,
  secret: string = env.paystackWebhookSecret || env.paystackSecretKey,
): boolean {
  if (!signatureHeader || !secret) return false;
  const body =
    typeof payload === "string" ? payload : payload.toString("utf8");
  const hash = createHmac("sha512", secret).update(body).digest("hex");
  try {
    const a = Buffer.from(hash, "utf8");
    const b = Buffer.from(signatureHeader, "utf8");
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

async function paystackFetch<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const secret = env.paystackSecretKey;
  if (!secret) {
    throw new PaystackError(
      "Paystack is not configured",
      503,
      "PAYSTACK_NOT_CONFIGURED",
    );
  }

  const res = await fetch(`${PAYSTACK_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${secret}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(init?.headers ?? {}),
    },
  });

  let json: PaystackApiResponse<T>;
  try {
    json = (await res.json()) as PaystackApiResponse<T>;
  } catch {
    throw new PaystackError(
      "Invalid response from Paystack",
      502,
      "PAYSTACK_BAD_RESPONSE",
    );
  }

  if (!res.ok || !json.status) {
    throw new PaystackError(
      json.message || `Paystack request failed (${res.status})`,
      502,
      "PAYSTACK_API_ERROR",
    );
  }

  return json.data;
}

export async function initializePaystackTransaction(input: {
  email: string;
  amountSubunit: number;
  currency: string;
  reference: string;
  callbackUrl: string;
  metadata?: Record<string, unknown>;
}): Promise<PaystackInitializeResult> {
  const data = await paystackFetch<{
    authorization_url: string;
    access_code: string;
    reference: string;
  }>("/transaction/initialize", {
    method: "POST",
    body: JSON.stringify({
      email: input.email,
      amount: input.amountSubunit,
      currency: input.currency.toUpperCase(),
      reference: input.reference,
      callback_url: input.callbackUrl,
      metadata: input.metadata ?? {},
    }),
  });

  return {
    authorizationUrl: data.authorization_url,
    accessCode: data.access_code,
    reference: data.reference,
  };
}

export async function verifyPaystackTransaction(
  reference: string,
): Promise<PaystackVerifyResult> {
  const data = await paystackFetch<{
    status: string;
    reference: string;
    amount: number;
    currency: string;
    paid_at?: string | null;
    gateway_response?: string | null;
    metadata?: Record<string, unknown> | string | null;
  }>(`/transaction/verify/${encodeURIComponent(reference)}`);

  let metadata: Record<string, unknown> | null = null;
  if (data.metadata && typeof data.metadata === "object") {
    metadata = data.metadata as Record<string, unknown>;
  } else if (typeof data.metadata === "string" && data.metadata.trim()) {
    try {
      metadata = JSON.parse(data.metadata) as Record<string, unknown>;
    } catch {
      metadata = null;
    }
  }

  return {
    status: data.status,
    reference: data.reference,
    amount: data.amount,
    currency: data.currency,
    paidAt: data.paid_at ?? null,
    gatewayResponse: data.gateway_response ?? null,
    metadata,
    raw: data,
  };
}
