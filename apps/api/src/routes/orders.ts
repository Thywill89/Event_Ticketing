import { Router } from "express";
import type { Request } from "express";
import { z } from "zod";
import type {
  CreateOrderResponse,
  ExpireReservationsResponse,
  InitializePaymentResponse,
  OrderResponse,
  PaymentConfigResponse,
} from "@event-ticketing/shared";
import {
  env,
  isPaystackConfigured,
  isStubPaymentsAllowed,
} from "../config/env";
import {
  OrderError,
  completeStubPayment,
  createOrder,
  expireDueReservations,
  getOrderDetailInternal,
  getOrderForGuest,
  handlePaystackWebhookEvent,
  initializeOrderPayment,
  verifyOrderPayment,
} from "../lib/orders";
import { notifyOrderConfirmation } from "../lib/notifications";
import { PaystackError, verifyPaystackSignature } from "../lib/paystack";

export const ordersRouter = Router();

type RequestWithRawBody = Request & { rawBody?: Buffer };

const createOrderSchema = z.object({
  purchaserName: z.string().trim().min(1).max(120),
  purchaserEmail: z.string().email().max(255),
  purchaserPhone: z.string().trim().min(5).max(40),
  items: z
    .array(
      z.object({
        ticketTypeId: z.string().min(1),
        quantity: z.number().int().min(1).max(20),
      }),
    )
    .min(1)
    .max(20),
});

function readAccess(req: {
  query: Record<string, unknown>;
  headers: Record<string, unknown>;
  body?: unknown;
}): { accessToken?: string; email?: string } {
  const q = req.query;
  const headerToken = req.headers["x-order-access-token"];
  const body =
    req.body && typeof req.body === "object"
      ? (req.body as Record<string, unknown>)
      : {};

  const accessToken =
    (typeof q.accessToken === "string" && q.accessToken) ||
    (typeof headerToken === "string" && headerToken) ||
    (typeof body.accessToken === "string" && body.accessToken) ||
    undefined;

  const email =
    (typeof q.email === "string" && q.email) ||
    (typeof body.email === "string" && body.email) ||
    undefined;

  return { accessToken, email };
}

function handleOrderError(
  res: {
    status: (code: number) => { json: (body: unknown) => void };
  },
  err: unknown,
): boolean {
  if (err instanceof OrderError) {
    res.status(err.status).json({ error: err.message, code: err.code });
    return true;
  }
  if (err instanceof PaystackError) {
    res.status(err.status).json({ error: err.message, code: err.code });
    return true;
  }
  return false;
}

function enqueueOrderConfirmation(order: {
  id: string;
  status: string;
  purchaserEmail: string;
  purchaserName: string;
  eventName: string;
  eventSlug: string;
  totalAmount: string;
  currency: string;
  accessToken: string;
  tickets: Array<{ ticketNumber: string; ticketTypeName: string }>;
}) {
  if (order.status !== "PAID" || order.tickets.length === 0) return;
  void notifyOrderConfirmation({
    id: order.id,
    purchaserEmail: order.purchaserEmail,
    purchaserName: order.purchaserName,
    eventName: order.eventName,
    eventSlug: order.eventSlug,
    totalAmount: order.totalAmount,
    currency: order.currency,
    accessToken: order.accessToken,
    tickets: order.tickets.map((t) => ({
      ticketNumber: t.ticketNumber,
      ticketTypeName: t.ticketTypeName,
    })),
  }).catch((err) => console.error("order confirmation email failed", err));
}

/**
 * GET /payments/config
 * Public: which payment path the UI should offer.
 */
ordersRouter.get("/payments/config", (_req, res) => {
  const paystack = isPaystackConfigured();
  const body: PaymentConfigResponse = {
    provider: paystack ? "paystack" : isStubPaymentsAllowed() ? "stub" : "none",
    stubAllowed: isStubPaymentsAllowed(),
    publicKey: paystack ? env.paystackPublicKey || null : null,
  };
  res.json(body);
});

/**
 * POST /orders/expire-reservations
 * Releases inventory for RESERVED orders past reservedUntil (plan §7.4).
 * When CRON_SECRET is set, requires header X-Cron-Secret (or Authorization: Bearer <secret>).
 * Schedule via host cron, e.g. every 5 minutes.
 */
ordersRouter.post("/orders/expire-reservations", async (req, res) => {
  if (env.cronSecret) {
    const headerSecret = req.header("x-cron-secret");
    const bearer = req.header("authorization");
    const bearerToken = bearer?.toLowerCase().startsWith("bearer ")
      ? bearer.slice(7).trim()
      : null;
    const provided = headerSecret?.trim() || bearerToken;
    if (!provided || provided !== env.cronSecret) {
      res.status(401).json({ error: "Invalid or missing cron secret" });
      return;
    }
  }

  try {
    const expiredCount = await expireDueReservations();
    const body: ExpireReservationsResponse = { expiredCount };
    res.json(body);
  } catch (err) {
    console.error("expire reservations failed", err);
    res.status(500).json({ error: "Failed to expire reservations" });
  }
});

/**
 * POST /events/:eventId/orders
 * Guest checkout: soft-reserve inventory + create PENDING payment.
 */
ordersRouter.post("/events/:eventId/orders", async (req, res) => {
  const eventId = req.params.eventId;
  if (!eventId?.trim()) {
    res.status(400).json({ error: "eventId is required" });
    return;
  }

  const parsed = createOrderSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request", details: parsed.error.flatten() });
    return;
  }

  try {
    const order = await createOrder({
      eventId,
      ...parsed.data,
    });
    const body: CreateOrderResponse = { order };
    res.status(201).json(body);
  } catch (err) {
    if (handleOrderError(res, err)) return;
    console.error("create order failed", err);
    res.status(500).json({ error: "Failed to create order" });
  }
});

/**
 * GET /orders/:orderId
 * Guest confirmation — requires accessToken (query/header) or matching email.
 */
ordersRouter.get("/orders/:orderId", async (req, res) => {
  const orderId = req.params.orderId;
  if (!orderId?.trim()) {
    res.status(400).json({ error: "orderId is required" });
    return;
  }

  try {
    const order = await getOrderForGuest(orderId, readAccess(req));
    const body: OrderResponse = { order };
    res.json(body);
  } catch (err) {
    if (handleOrderError(res, err)) return;
    console.error("get order failed", err);
    res.status(500).json({ error: "Failed to load order" });
  }
});

/**
 * POST /orders/:orderId/payments/initialize
 * Create a Paystack transaction; returns authorization_url / access_code.
 */
ordersRouter.post("/orders/:orderId/payments/initialize", async (req, res) => {
  const orderId = req.params.orderId;
  if (!orderId?.trim()) {
    res.status(400).json({ error: "orderId is required" });
    return;
  }

  try {
    const result = await initializeOrderPayment(orderId, readAccess(req));
    const body: InitializePaymentResponse = {
      order: result.order,
      authorizationUrl: result.authorizationUrl,
      accessCode: result.accessCode,
      reference: result.reference,
      publicKey: result.publicKey,
    };
    res.json(body);
  } catch (err) {
    if (handleOrderError(res, err)) return;
    console.error("initialize payment failed", err);
    res.status(500).json({ error: "Failed to initialize payment" });
  }
});

/**
 * POST /orders/:orderId/payments/verify
 * Optional client callback: verify Paystack transaction and fulfill order.
 * Body/query may include `reference` (Paystack returns reference / trxref).
 */
ordersRouter.post("/orders/:orderId/payments/verify", async (req, res) => {
  const orderId = req.params.orderId;
  if (!orderId?.trim()) {
    res.status(400).json({ error: "orderId is required" });
    return;
  }

  const bodyObj =
    req.body && typeof req.body === "object"
      ? (req.body as Record<string, unknown>)
      : {};
  const reference =
    (typeof bodyObj.reference === "string" && bodyObj.reference) ||
    (typeof req.query.reference === "string" && req.query.reference) ||
    (typeof req.query.trxref === "string" && req.query.trxref) ||
    undefined;

  try {
    const order = await verifyOrderPayment(orderId, readAccess(req), reference);
    enqueueOrderConfirmation(order);
    const body: OrderResponse = { order };
    res.json(body);
  } catch (err) {
    if (handleOrderError(res, err)) return;
    console.error("verify payment failed", err);
    res.status(500).json({ error: "Failed to verify payment" });
  }
});

/**
 * POST /orders/:orderId/payments/stub-complete
 * Local/dev backend verification that marks payment succeeded and issues tickets.
 * Gated: ALLOW_STUB_PAYMENTS=true, or non-production without Paystack keys.
 */
ordersRouter.post("/orders/:orderId/payments/stub-complete", async (req, res) => {
  const orderId = req.params.orderId;
  if (!orderId?.trim()) {
    res.status(400).json({ error: "orderId is required" });
    return;
  }

  try {
    const order = await completeStubPayment(orderId, readAccess(req));
    enqueueOrderConfirmation(order);
    const body: OrderResponse = { order };
    res.json(body);
  } catch (err) {
    if (handleOrderError(res, err)) return;
    console.error("stub payment failed", err);
    res.status(500).json({ error: "Failed to complete stub payment" });
  }
});

/**
 * POST /payments/webhook
 * Paystack webhooks — verify x-paystack-signature (HMAC SHA512).
 * Handles charge.success (fulfill) and relevant failures.
 */
ordersRouter.post("/payments/webhook", async (req, res) => {
  if (!isPaystackConfigured()) {
    res.status(503).json({
      error: "Paystack is not configured",
      code: "PAYSTACK_NOT_CONFIGURED",
    });
    return;
  }

  const rawReq = req as RequestWithRawBody;
  const signature = req.header("x-paystack-signature") ?? undefined;
  const rawBody =
    rawReq.rawBody ??
    Buffer.from(JSON.stringify(req.body ?? {}), "utf8");

  if (!verifyPaystackSignature(rawBody, signature)) {
    res.status(401).json({ error: "Invalid Paystack signature" });
    return;
  }

  const event =
    req.body && typeof req.body === "object"
      ? (req.body as { event?: string; data?: Record<string, unknown> })
      : null;

  if (!event?.event) {
    res.status(400).json({ error: "Invalid webhook payload" });
    return;
  }

  try {
    const result = await handlePaystackWebhookEvent({
      event: event.event,
      data: event.data as {
        reference?: string;
        status?: string;
        amount?: number;
        currency?: string;
        paid_at?: string | null;
        gateway_response?: string | null;
        metadata?: Record<string, unknown> | null;
      },
    });

    if (result.orderId && event.event === "charge.success") {
      try {
        const order = await getOrderDetailInternal(result.orderId);
        enqueueOrderConfirmation(order);
      } catch (notifyErr) {
        console.error("webhook confirmation notify failed", notifyErr);
      }
    }

    // Always 200 so Paystack does not retry endlessly on business-rule conflicts
    res.status(200).json({ received: true, handled: result.handled });
  } catch (err) {
    if (err instanceof OrderError && err.code === "ORDER_CANCELLED_AFTER_PAYMENT") {
      console.error("Paystack paid after order cancelled — reconcile", {
        code: err.code,
        message: err.message,
      });
      res.status(200).json({ received: true, handled: false, code: err.code });
      return;
    }
    console.error("Paystack webhook failed", err);
    // 500 so Paystack retries transient failures
    res.status(500).json({ error: "Webhook processing failed" });
  }
});
