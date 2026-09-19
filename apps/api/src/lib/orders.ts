import { Prisma } from "../../prisma/generated";
import type {
  IssuedTicketDto,
  OrderDetailDto,
  OrderItemDto,
  OrderStatus,
  PaymentDto,
  PaymentStatus,
  TicketStatus,
} from "@event-ticketing/shared";
import { prisma } from "../db";
import {
  env,
  isPaystackConfigured,
  isStubPaymentsAllowed,
} from "../config/env";
import {
  initializePaystackTransaction,
  toPaystackAmount,
  verifyPaystackTransaction,
  type PaystackVerifyResult,
} from "./paystack";
import {
  generateOrderAccessToken,
  generateQrToken,
  generateTicketNumber,
} from "./ticket-codes";

export class OrderError extends Error {
  status: number;
  code: string;

  constructor(message: string, status: number, code: string) {
    super(message);
    this.name = "OrderError";
    this.status = status;
    this.code = code;
  }
}

export type CreateOrderInput = {
  eventId: string;
  purchaserName: string;
  purchaserEmail: string;
  purchaserPhone: string;
  items: Array<{ ticketTypeId: string; quantity: number }>;
};

export type InitializePaymentResult = {
  order: OrderDetailDto;
  authorizationUrl: string;
  accessCode: string;
  reference: string;
  publicKey: string | null;
};

const orderDetailInclude = {
  event: { select: { id: true, name: true, slug: true } },
  items: {
    include: { ticketType: { select: { id: true, name: true } } },
    orderBy: { id: "asc" as const },
  },
  payment: true,
  tickets: {
    include: { ticketType: { select: { id: true, name: true } } },
    orderBy: { createdAt: "asc" as const },
  },
} satisfies Prisma.OrderInclude;

type OrderDetailRow = Prisma.OrderGetPayload<{ include: typeof orderDetailInclude }>;

function money(value: Prisma.Decimal): string {
  return value.toFixed(2);
}

function toPaymentDto(
  payment: NonNullable<OrderDetailRow["payment"]>,
): PaymentDto {
  return {
    id: payment.id,
    orderId: payment.orderId,
    status: payment.status as PaymentStatus,
    amount: money(payment.amount),
    currency: payment.currency,
    provider: payment.provider,
    providerRef: payment.providerRef,
    paidAt: payment.paidAt?.toISOString() ?? null,
  };
}

function toOrderItemDto(
  item: OrderDetailRow["items"][number],
): OrderItemDto {
  return {
    id: item.id,
    ticketTypeId: item.ticketTypeId,
    ticketTypeName: item.ticketType.name,
    quantity: item.quantity,
    unitPrice: money(item.unitPrice),
    lineTotal: money(item.lineTotal),
  };
}

function toIssuedTicketDto(
  ticket: OrderDetailRow["tickets"][number],
): IssuedTicketDto {
  return {
    id: ticket.id,
    ticketNumber: ticket.ticketNumber,
    ticketTypeId: ticket.ticketTypeId,
    ticketTypeName: ticket.ticketType.name,
    status: ticket.status as TicketStatus,
    qrToken: ticket.qrToken,
    issuedAt: ticket.issuedAt?.toISOString() ?? null,
  };
}

export function toOrderDetailDto(order: OrderDetailRow): OrderDetailDto {
  return {
    id: order.id,
    eventId: order.eventId,
    eventName: order.event.name,
    eventSlug: order.event.slug,
    status: order.status as OrderStatus,
    purchaserName: order.purchaserName,
    purchaserEmail: order.purchaserEmail,
    purchaserPhone: order.purchaserPhone,
    currency: order.currency,
    subtotalAmount: money(order.subtotalAmount),
    totalAmount: money(order.totalAmount),
    reservedUntil: order.reservedUntil?.toISOString() ?? null,
    accessToken: order.accessToken,
    items: order.items.map(toOrderItemDto),
    payment: order.payment ? toPaymentDto(order.payment) : null,
    tickets: order.tickets.map(toIssuedTicketDto),
    createdAt: order.createdAt.toISOString(),
  };
}

async function loadOrderDetail(orderId: string): Promise<OrderDetailRow> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: orderDetailInclude,
  });
  if (!order) {
    throw new OrderError("Order not found", 404, "ORDER_NOT_FOUND");
  }
  return order;
}

function assertAccess(
  order: { accessToken: string; purchaserEmail: string },
  accessToken: string | undefined,
  email: string | undefined,
) {
  const tokenOk =
    typeof accessToken === "string" &&
    accessToken.length > 0 &&
    accessToken === order.accessToken;
  const emailOk =
    typeof email === "string" &&
    email.trim().length > 0 &&
    email.trim().toLowerCase() === order.purchaserEmail.toLowerCase();

  if (!tokenOk && !emailOk) {
    throw new OrderError(
      "Order access denied — provide accessToken or matching email",
      403,
      "ORDER_ACCESS_DENIED",
    );
  }
}

/**
 * Atomically soft-reserve inventory. Returns false if insufficient stock.
 * available = quantityTotal − quantityReserved − quantitySold
 */
async function tryReserveInventory(
  tx: Prisma.TransactionClient,
  ticketTypeId: string,
  eventId: string,
  quantity: number,
): Promise<boolean> {
  const updated = await tx.$executeRaw`
    UPDATE "TicketType"
    SET
      "quantityReserved" = "quantityReserved" + ${quantity},
      "updatedAt" = CURRENT_TIMESTAMP
    WHERE id = ${ticketTypeId}
      AND "eventId" = ${eventId}
      AND "isActive" = true
      AND ("quantityTotal" - "quantityReserved" - "quantitySold") >= ${quantity}
  `;
  return updated === 1;
}

async function releaseInventory(
  tx: Prisma.TransactionClient,
  ticketTypeId: string,
  quantity: number,
): Promise<void> {
  await tx.$executeRaw`
    UPDATE "TicketType"
    SET
      "quantityReserved" = GREATEST(0, "quantityReserved" - ${quantity}),
      "updatedAt" = CURRENT_TIMESTAMP
    WHERE id = ${ticketTypeId}
  `;
}

async function convertReservedToSold(
  tx: Prisma.TransactionClient,
  ticketTypeId: string,
  quantity: number,
): Promise<boolean> {
  const updated = await tx.$executeRaw`
    UPDATE "TicketType"
    SET
      "quantityReserved" = "quantityReserved" - ${quantity},
      "quantitySold" = "quantitySold" + ${quantity},
      "updatedAt" = CURRENT_TIMESTAMP
    WHERE id = ${ticketTypeId}
      AND "quantityReserved" >= ${quantity}
  `;
  return updated === 1;
}

async function issueTicketsForOrder(
  tx: Prisma.TransactionClient,
  order: {
    id: string;
    eventId: string;
    purchaserName: string;
    purchaserEmail: string;
    purchaserPhone: string;
  },
  items: Array<{ id: string; ticketTypeId: string; quantity: number }>,
): Promise<void> {
  const now = new Date();
  for (const item of items) {
    for (let i = 0; i < item.quantity; i += 1) {
      let created = false;
      for (let attempt = 0; attempt < 8 && !created; attempt += 1) {
        try {
          await tx.ticket.create({
            data: {
              eventId: order.eventId,
              orderId: order.id,
              orderItemId: item.id,
              ticketTypeId: item.ticketTypeId,
              status: "ISSUED",
              ticketNumber: generateTicketNumber(),
              qrToken: generateQrToken(),
              attendeeName: order.purchaserName,
              attendeeEmail: order.purchaserEmail,
              attendeePhone: order.purchaserPhone,
              issuedAt: now,
            },
          });
          created = true;
        } catch (err) {
          if (
            err instanceof Prisma.PrismaClientKnownRequestError &&
            err.code === "P2002"
          ) {
            continue;
          }
          throw err;
        }
      }
      if (!created) {
        throw new OrderError(
          "Failed to issue unique ticket codes",
          500,
          "TICKET_ISSUE_FAILED",
        );
      }
    }
  }
}

/**
 * Release inventory for a single expired/cancelled reserved order.
 * Idempotent for non-RESERVED statuses.
 */
export async function expireOrderIfNeeded(
  orderId: string,
  options?: { force?: boolean },
): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    const order = await tx.order.findUnique({
      where: { id: orderId },
      include: { items: true, payment: true, tickets: { select: { id: true } } },
    });
    if (!order) return false;
    if (order.status !== "RESERVED") return false;
    if (order.tickets.length > 0) return false;

    const expired =
      options?.force === true ||
      (order.reservedUntil != null && order.reservedUntil.getTime() <= Date.now());

    if (!expired) return false;

    for (const item of order.items) {
      await releaseInventory(tx, item.ticketTypeId, item.quantity);
    }

    await tx.order.update({
      where: { id: order.id },
      data: {
        status: "CANCELLED",
        reservedUntil: null,
      },
    });

    if (order.payment && order.payment.status === "PENDING") {
      await tx.payment.update({
        where: { id: order.payment.id },
        data: { status: "FAILED" },
      });
    }

    return true;
  });
}

export async function expireDueReservations(): Promise<number> {
  const due = await prisma.order.findMany({
    where: {
      status: "RESERVED",
      reservedUntil: { lte: new Date() },
    },
    select: { id: true },
  });

  let expiredCount = 0;
  for (const row of due) {
    const did = await expireOrderIfNeeded(row.id);
    if (did) expiredCount += 1;
  }
  return expiredCount;
}

function ticketTypeOnSale(tt: {
  isActive: boolean;
  salesStartsAt: Date | null;
  salesEndsAt: Date | null;
}, now: Date): boolean {
  if (!tt.isActive) return false;
  if (tt.salesStartsAt && tt.salesStartsAt.getTime() > now.getTime()) return false;
  if (tt.salesEndsAt && tt.salesEndsAt.getTime() < now.getTime()) return false;
  return true;
}

export async function createOrder(
  input: CreateOrderInput,
): Promise<OrderDetailDto> {
  const event = await prisma.event.findUnique({
    where: { id: input.eventId },
    select: { id: true, status: true },
  });

  if (!event) {
    throw new OrderError("Event not found", 404, "EVENT_NOT_FOUND");
  }
  if (event.status !== "SALES_OPEN") {
    throw new OrderError(
      "Tickets are not on sale for this event",
      409,
      "SALES_NOT_OPEN",
    );
  }

  // Merge duplicate ticket type lines
  const quantityByType = new Map<string, number>();
  for (const item of input.items) {
    quantityByType.set(
      item.ticketTypeId,
      (quantityByType.get(item.ticketTypeId) ?? 0) + item.quantity,
    );
  }
  const mergedItems = [...quantityByType.entries()].map(
    ([ticketTypeId, quantity]) => ({ ticketTypeId, quantity }),
  );

  if (mergedItems.length === 0) {
    throw new OrderError("At least one ticket is required", 400, "EMPTY_CART");
  }

  const ticketTypeIds = mergedItems.map((i) => i.ticketTypeId);
  const ticketTypes = await prisma.ticketType.findMany({
    where: { id: { in: ticketTypeIds }, eventId: event.id },
  });
  if (ticketTypes.length !== ticketTypeIds.length) {
    throw new OrderError(
      "One or more ticket types are invalid for this event",
      400,
      "INVALID_TICKET_TYPE",
    );
  }

  const now = new Date();
  const ttById = new Map(ticketTypes.map((tt) => [tt.id, tt]));
  for (const item of mergedItems) {
    const tt = ttById.get(item.ticketTypeId)!;
    if (!ticketTypeOnSale(tt, now)) {
      throw new OrderError(
        `Ticket type "${tt.name}" is not currently on sale`,
        409,
        "TICKET_TYPE_NOT_ON_SALE",
      );
    }
  }

  const currencies = new Set(ticketTypes.map((tt) => tt.currency));
  if (currencies.size !== 1) {
    throw new OrderError(
      "All ticket types in an order must share the same currency",
      400,
      "CURRENCY_MISMATCH",
    );
  }
  const currency = ticketTypes[0]!.currency;

  const lineSnapshots = mergedItems.map((item) => {
    const tt = ttById.get(item.ticketTypeId)!;
    const unitPrice = tt.price;
    const lineTotal = unitPrice.mul(item.quantity);
    return {
      ticketTypeId: item.ticketTypeId,
      quantity: item.quantity,
      unitPrice,
      lineTotal,
    };
  });

  const subtotal = lineSnapshots.reduce(
    (sum, line) => sum.add(line.lineTotal),
    new Prisma.Decimal(0),
  );
  const reservedUntil = new Date(
    now.getTime() + env.orderReservationMinutes * 60_000,
  );
  const accessToken = generateOrderAccessToken();
  const usePaystack = isPaystackConfigured();
  if (!usePaystack && !isStubPaymentsAllowed()) {
    throw new OrderError(
      "Payment provider is not configured",
      503,
      "PAYMENTS_NOT_CONFIGURED",
    );
  }
  const paymentProvider = usePaystack ? "paystack" : "stub";

  const orderId = await prisma.$transaction(async (tx) => {
    for (const line of lineSnapshots) {
      const ok = await tryReserveInventory(
        tx,
        line.ticketTypeId,
        event.id,
        line.quantity,
      );
      if (!ok) {
        throw new OrderError(
          "Not enough tickets available for one or more selections",
          409,
          "INSUFFICIENT_INVENTORY",
        );
      }
    }

    const order = await tx.order.create({
      data: {
        eventId: event.id,
        status: "RESERVED",
        purchaserName: input.purchaserName,
        purchaserEmail: input.purchaserEmail.toLowerCase(),
        purchaserPhone: input.purchaserPhone,
        currency,
        subtotalAmount: subtotal,
        totalAmount: subtotal,
        reservedUntil,
        accessToken,
        items: {
          create: lineSnapshots.map((line) => ({
            ticketTypeId: line.ticketTypeId,
            quantity: line.quantity,
            unitPrice: line.unitPrice,
            lineTotal: line.lineTotal,
          })),
        },
        payment: {
          create: {
            status: "PENDING",
            provider: paymentProvider,
            providerRef:
              paymentProvider === "stub" ? `stub_${randomRef()}` : null,
            amount: subtotal,
            currency,
          },
        },
      },
      select: { id: true },
    });

    return order.id;
  });

  return toOrderDetailDto(await loadOrderDetail(orderId));
}

function randomRef(): string {
  return generateOrderAccessToken().slice(0, 16);
}

/**
 * Convert reserved inventory → sold, issue tickets, mark payment SUCCEEDED + order PAID.
 * Caller must ensure the order is still RESERVED with a pending payment (or handle idempotency).
 */
async function fulfillSuccessfulPayment(input: {
  orderId: string;
  paymentId: string;
  provider: string;
  providerRef: string;
  rawPayload: Prisma.InputJsonValue;
  paidAt?: Date;
}): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const locked = await tx.order.findUnique({
      where: { id: input.orderId },
      include: {
        payment: true,
        tickets: { select: { id: true } },
        items: true,
      },
    });
    if (!locked) {
      throw new OrderError("Order not found", 404, "ORDER_NOT_FOUND");
    }

    // Idempotent: already paid with tickets
    if (locked.status === "PAID" && locked.tickets.length > 0) {
      return;
    }

    if (locked.status !== "RESERVED") {
      throw new OrderError(
        `Order cannot be paid in status ${locked.status}`,
        409,
        "INVALID_ORDER_STATUS",
      );
    }

    if (!locked.payment || locked.payment.id !== input.paymentId) {
      throw new OrderError(
        "No pending payment found for this order",
        409,
        "PAYMENT_NOT_PENDING",
      );
    }

    if (locked.payment.status === "SUCCEEDED" && locked.tickets.length > 0) {
      return;
    }

    if (locked.payment.status !== "PENDING") {
      throw new OrderError(
        "No pending payment found for this order",
        409,
        "PAYMENT_NOT_PENDING",
      );
    }

    for (const item of locked.items) {
      const ok = await convertReservedToSold(tx, item.ticketTypeId, item.quantity);
      if (!ok) {
        throw new OrderError(
          "Inventory reconciliation failed during payment",
          500,
          "INVENTORY_CONVERT_FAILED",
        );
      }
    }

    await issueTicketsForOrder(tx, locked, locked.items);

    await tx.payment.update({
      where: { id: locked.payment.id },
      data: {
        status: "SUCCEEDED",
        provider: input.provider,
        providerRef: input.providerRef,
        paidAt: input.paidAt ?? new Date(),
        rawPayload: input.rawPayload,
      },
    });

    await tx.order.update({
      where: { id: locked.id },
      data: {
        status: "PAID",
        reservedUntil: null,
      },
    });
  });
}

export async function getOrderForGuest(
  orderId: string,
  access: { accessToken?: string; email?: string },
): Promise<OrderDetailDto> {
  await expireOrderIfNeeded(orderId);

  const order = await loadOrderDetail(orderId);
  assertAccess(order, access.accessToken, access.email);
  return toOrderDetailDto(order);
}

/** Internal: load order detail without guest access check (webhook / jobs). */
export async function getOrderDetailInternal(
  orderId: string,
): Promise<OrderDetailDto> {
  return toOrderDetailDto(await loadOrderDetail(orderId));
}

/**
 * Local/dev payment verification stub (plan §8.2 trust rule still applies:
 * browser success alone must not issue tickets — this endpoint is the backend verify step).
 */
export async function completeStubPayment(
  orderId: string,
  access: { accessToken?: string; email?: string },
): Promise<OrderDetailDto> {
  if (!isStubPaymentsAllowed()) {
    throw new OrderError(
      "Stub payments are disabled",
      403,
      "STUB_PAYMENTS_DISABLED",
    );
  }

  await expireOrderIfNeeded(orderId);

  const existing = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      items: true,
      payment: true,
      tickets: { select: { id: true } },
    },
  });
  if (!existing) {
    throw new OrderError("Order not found", 404, "ORDER_NOT_FOUND");
  }
  assertAccess(existing, access.accessToken, access.email);

  if (existing.status === "PAID" && existing.tickets.length > 0) {
    return toOrderDetailDto(await loadOrderDetail(orderId));
  }

  if (existing.status === "CANCELLED") {
    throw new OrderError(
      "Order reservation expired or was cancelled",
      410,
      "ORDER_EXPIRED",
    );
  }

  if (existing.status !== "RESERVED") {
    throw new OrderError(
      `Order cannot be paid in status ${existing.status}`,
      409,
      "INVALID_ORDER_STATUS",
    );
  }

  if (
    existing.reservedUntil &&
    existing.reservedUntil.getTime() <= Date.now()
  ) {
    await expireOrderIfNeeded(orderId, { force: true });
    throw new OrderError(
      "Order reservation expired",
      410,
      "ORDER_EXPIRED",
    );
  }

  if (!existing.payment || existing.payment.status !== "PENDING") {
    throw new OrderError(
      "No pending payment found for this order",
      409,
      "PAYMENT_NOT_PENDING",
    );
  }

  await fulfillSuccessfulPayment({
    orderId: existing.id,
    paymentId: existing.payment.id,
    provider: "stub",
    providerRef: existing.payment.providerRef ?? `stub_${randomRef()}`,
    rawPayload: {
      provider: "stub",
      verifiedAt: new Date().toISOString(),
      note: "Local stub payment — replace with provider webhook verification",
    },
  });

  return toOrderDetailDto(await loadOrderDetail(orderId));
}

function buildCallbackUrl(order: {
  id: string;
  accessToken: string;
}): string {
  const base = env.publicWebUrl || env.webOrigins()[0] || "http://localhost:3000";
  const url = new URL(`/orders/${order.id}`, `${base}/`);
  url.searchParams.set("accessToken", order.accessToken);
  url.searchParams.set("payment", "paystack");
  return url.toString();
}

/**
 * Initialize a Paystack transaction for a reserved order.
 * Returns authorization_url / access_code for redirect or Popup.
 */
export async function initializeOrderPayment(
  orderId: string,
  access: { accessToken?: string; email?: string },
): Promise<InitializePaymentResult> {
  if (!isPaystackConfigured()) {
    throw new OrderError(
      "Paystack is not configured",
      503,
      "PAYSTACK_NOT_CONFIGURED",
    );
  }

  await expireOrderIfNeeded(orderId);

  const existing = await prisma.order.findUnique({
    where: { id: orderId },
    include: { payment: true, tickets: { select: { id: true } } },
  });
  if (!existing) {
    throw new OrderError("Order not found", 404, "ORDER_NOT_FOUND");
  }
  assertAccess(existing, access.accessToken, access.email);

  if (existing.status === "PAID" && existing.tickets.length > 0) {
    throw new OrderError("Order is already paid", 409, "ORDER_ALREADY_PAID");
  }

  if (existing.status === "CANCELLED") {
    throw new OrderError(
      "Order reservation expired or was cancelled",
      410,
      "ORDER_EXPIRED",
    );
  }

  if (existing.status !== "RESERVED") {
    throw new OrderError(
      `Order cannot be paid in status ${existing.status}`,
      409,
      "INVALID_ORDER_STATUS",
    );
  }

  if (
    existing.reservedUntil &&
    existing.reservedUntil.getTime() <= Date.now()
  ) {
    await expireOrderIfNeeded(orderId, { force: true });
    throw new OrderError("Order reservation expired", 410, "ORDER_EXPIRED");
  }

  if (!existing.payment || existing.payment.status !== "PENDING") {
    throw new OrderError(
      "No pending payment found for this order",
      409,
      "PAYMENT_NOT_PENDING",
    );
  }

  const reference = `ord_${existing.id}_${randomRef()}`;
  const amountSubunit = toPaystackAmount(money(existing.totalAmount));
  const currency = existing.currency.toUpperCase();

  const init = await initializePaystackTransaction({
    email: existing.purchaserEmail,
    amountSubunit,
    currency,
    reference,
    callbackUrl: buildCallbackUrl(existing),
    metadata: {
      orderId: existing.id,
      eventId: existing.eventId,
      custom_fields: [
        {
          display_name: "Order ID",
          variable_name: "order_id",
          value: existing.id,
        },
      ],
    },
  });

  await prisma.payment.update({
    where: { id: existing.payment.id },
    data: {
      provider: "paystack",
      providerRef: init.reference,
      rawPayload: {
        initializedAt: new Date().toISOString(),
        accessCode: init.accessCode,
        authorizationUrl: init.authorizationUrl,
      },
    },
  });

  const order = toOrderDetailDto(await loadOrderDetail(orderId));
  return {
    order,
    authorizationUrl: init.authorizationUrl,
    accessCode: init.accessCode,
    reference: init.reference,
    publicKey: env.paystackPublicKey || null,
  };
}

function expectedAmountMatches(
  paymentAmount: Prisma.Decimal,
  paystackSubunit: number,
): boolean {
  return toPaystackAmount(money(paymentAmount)) === paystackSubunit;
}

/**
 * Apply a verified Paystack success (from webhook or verify API).
 * Idempotent when the same reference already fulfilled the order.
 */
export async function applyPaystackSuccess(input: {
  reference: string;
  verified: PaystackVerifyResult;
  source: "webhook" | "verify";
}): Promise<OrderDetailDto | null> {
  const { reference, verified } = input;

  if (verified.status !== "success") {
    // Mark pending payment failed when verify reports a terminal failure.
    if (["failed", "abandoned", "reversed"].includes(verified.status)) {
      const payment = await prisma.payment.findFirst({
        where: { providerRef: reference },
      });
      if (payment && payment.status === "PENDING") {
        await prisma.payment.update({
          where: { id: payment.id },
          data: {
            status: "FAILED",
            rawPayload: {
              source: input.source,
              verifiedAt: new Date().toISOString(),
              paystack: verified.raw as Prisma.InputJsonValue,
            } as Prisma.InputJsonValue,
          },
        });
      }
    }
    return null;
  }

  let payment = await prisma.payment.findFirst({
    where: { providerRef: reference },
    include: {
      order: {
        include: {
          items: true,
          tickets: { select: { id: true } },
        },
      },
    },
  });

  // Fallback: metadata.orderId when providerRef was not stored yet
  if (!payment) {
    const orderId =
      typeof verified.metadata?.orderId === "string"
        ? verified.metadata.orderId
        : null;
    if (orderId) {
      payment = await prisma.payment.findFirst({
        where: { orderId },
        include: {
          order: {
            include: {
              items: true,
              tickets: { select: { id: true } },
            },
          },
        },
      });
    }
  }

  if (!payment) {
    throw new OrderError(
      "Payment not found for Paystack reference",
      404,
      "PAYMENT_NOT_FOUND",
    );
  }

  const order = payment.order;

  if (order.status === "PAID" && order.tickets.length > 0) {
    return toOrderDetailDto(await loadOrderDetail(order.id));
  }

  if (order.status === "CANCELLED") {
    // Paid after expiry — still fulfill so the customer is not charged without tickets.
    // Re-open only if no tickets yet; inventory was released so we cannot convert reserved→sold.
    // Prefer: mark payment succeeded and leave a reconciliation note — but plan wants tickets.
    // Safest recoverable path: if cancelled without tickets, attempt re-reserve is complex.
    // For MVP: throw so ops can reconcile; webhook still returns 200 after logging.
    throw new OrderError(
      "Order was cancelled before payment completed — reconcile manually",
      409,
      "ORDER_CANCELLED_AFTER_PAYMENT",
    );
  }

  if (!expectedAmountMatches(payment.amount, verified.amount)) {
    throw new OrderError(
      "Paystack amount does not match order",
      409,
      "AMOUNT_MISMATCH",
    );
  }

  if (
    verified.currency &&
    verified.currency.toUpperCase() !== payment.currency.toUpperCase()
  ) {
    throw new OrderError(
      "Paystack currency does not match order",
      409,
      "CURRENCY_MISMATCH",
    );
  }

  await fulfillSuccessfulPayment({
    orderId: order.id,
    paymentId: payment.id,
    provider: "paystack",
    providerRef: reference,
    paidAt: verified.paidAt ? new Date(verified.paidAt) : new Date(),
    rawPayload: {
      source: input.source,
      verifiedAt: new Date().toISOString(),
      paystack: verified.raw as Prisma.InputJsonValue,
    } as Prisma.InputJsonValue,
  });

  return toOrderDetailDto(await loadOrderDetail(order.id));
}

/**
 * Client callback / polling: verify transaction with Paystack then fulfill.
 */
export async function verifyOrderPayment(
  orderId: string,
  access: { accessToken?: string; email?: string },
  reference?: string,
): Promise<OrderDetailDto> {
  if (!isPaystackConfigured()) {
    throw new OrderError(
      "Paystack is not configured",
      503,
      "PAYSTACK_NOT_CONFIGURED",
    );
  }

  await expireOrderIfNeeded(orderId);

  const existing = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      payment: true,
      tickets: { select: { id: true } },
    },
  });
  if (!existing) {
    throw new OrderError("Order not found", 404, "ORDER_NOT_FOUND");
  }
  assertAccess(existing, access.accessToken, access.email);

  if (existing.status === "PAID" && existing.tickets.length > 0) {
    return toOrderDetailDto(await loadOrderDetail(orderId));
  }

  const ref = reference?.trim() || existing.payment?.providerRef;
  if (!ref) {
    throw new OrderError(
      "No Paystack reference to verify",
      400,
      "MISSING_REFERENCE",
    );
  }

  const verified = await verifyPaystackTransaction(ref);
  const result = await applyPaystackSuccess({
    reference: ref,
    verified,
    source: "verify",
  });

  if (!result) {
    throw new OrderError(
      `Payment not successful (status: ${verified.status})`,
      409,
      "PAYMENT_NOT_SUCCESSFUL",
    );
  }

  return result;
}

/**
 * Webhook handler for charge.success (and relevant failures).
 */
export async function handlePaystackWebhookEvent(event: {
  event: string;
  data?: {
    reference?: string;
    status?: string;
    amount?: number;
    currency?: string;
    paid_at?: string | null;
    gateway_response?: string | null;
    metadata?: Record<string, unknown> | null;
    [key: string]: unknown;
  };
}): Promise<{ handled: boolean; orderId?: string }> {
  const data = event.data;
  const reference = data?.reference;
  if (!reference) {
    return { handled: false };
  }

  if (event.event === "charge.success") {
    const verified: PaystackVerifyResult = {
      status: data.status === "success" || !data.status ? "success" : data.status,
      reference,
      amount: Number(data.amount ?? 0),
      currency: String(data.currency ?? ""),
      paidAt: data.paid_at ?? null,
      gatewayResponse: data.gateway_response ?? null,
      metadata:
        data.metadata && typeof data.metadata === "object"
          ? data.metadata
          : null,
      raw: data,
    };

    // Prefer live verify for amount trust, fall back to webhook payload if verify fails
    let payload = verified;
    try {
      payload = await verifyPaystackTransaction(reference);
    } catch (err) {
      console.warn(
        "Paystack webhook: verify API failed, using webhook payload",
        err,
      );
    }

    const order = await applyPaystackSuccess({
      reference,
      verified: payload,
      source: "webhook",
    });
    return { handled: true, orderId: order?.id };
  }

  if (
    event.event === "charge.failed" ||
    (data.status && ["failed", "abandoned"].includes(String(data.status)))
  ) {
    const payment = await prisma.payment.findFirst({
      where: { providerRef: reference },
    });
    if (payment && payment.status === "PENDING") {
      await prisma.payment.update({
        where: { id: payment.id },
        data: {
          status: "FAILED",
          rawPayload: {
            source: "webhook",
            event: event.event,
            receivedAt: new Date().toISOString(),
            paystack: data as Prisma.InputJsonValue,
          } as Prisma.InputJsonValue,
        },
      });
    }
    return { handled: true, orderId: payment?.orderId };
  }

  return { handled: false };
}
