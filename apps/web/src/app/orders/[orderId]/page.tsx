"use client";

import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import type {
  OrderDetailDto,
  PaymentConfigResponse,
} from "@event-ticketing/shared";
import { PublicShell } from "@/components/site-header";
import { TicketQrImage } from "@/components/ticket-qr-image";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  ApiError,
  completeStubPayment,
  getOrder,
  getPaymentConfig,
  initializePayment,
  verifyPayment,
} from "@/lib/api";

function formatMoney(amount: string, currency: string): string {
  const n = Number(amount);
  if (Number.isFinite(n)) {
    try {
      return new Intl.NumberFormat(undefined, {
        style: "currency",
        currency,
      }).format(n);
    } catch {
      /* fall through */
    }
  }
  return `${currency} ${amount}`;
}

function OrderConfirmationInner() {
  const params = useParams<{ orderId: string }>();
  const searchParams = useSearchParams();
  const orderId = params.orderId;
  const accessToken = searchParams.get("accessToken") ?? undefined;
  const email = searchParams.get("email") ?? undefined;
  const paystackReference =
    searchParams.get("reference") ?? searchParams.get("trxref") ?? undefined;

  const [order, setOrder] = useState<OrderDetailDto | null>(null);
  const [paymentConfig, setPaymentConfig] =
    useState<PaymentConfigResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [paying, setPaying] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const verifyAttempted = useRef(false);

  const load = useCallback(async () => {
    if (!orderId) return;
    setLoading(true);
    setError(null);
    try {
      const [data, config] = await Promise.all([
        getOrder(orderId, { accessToken, email }),
        getPaymentConfig().catch(() => null),
      ]);
      setOrder(data);
      if (config) setPaymentConfig(config);
    } catch (err) {
      setOrder(null);
      setError(
        err instanceof ApiError
          ? err.message
          : "Failed to load order",
      );
    } finally {
      setLoading(false);
    }
  }, [orderId, accessToken, email]);

  useEffect(() => {
    void load();
  }, [load]);

  // After Paystack redirect, verify on the backend (plan §8.2).
  useEffect(() => {
    if (!orderId || !paystackReference || verifyAttempted.current) return;
    if (order?.status === "PAID") return;
    verifyAttempted.current = true;
    setVerifying(true);
    setError(null);
    void (async () => {
      try {
        const data = await verifyPayment(
          orderId,
          { accessToken, email },
          paystackReference,
        );
        setOrder(data);
      } catch (err) {
        setError(
          err instanceof ApiError
            ? err.message
            : "Payment verification failed — if you were charged, refresh shortly or contact support.",
        );
        await load();
      } finally {
        setVerifying(false);
      }
    })();
  }, [
    orderId,
    paystackReference,
    accessToken,
    email,
    order?.status,
    load,
  ]);

  async function onStubPay() {
    if (!orderId) return;
    setPaying(true);
    setError(null);
    try {
      const data = await completeStubPayment(orderId, { accessToken, email });
      setOrder(data);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Stub payment failed",
      );
    } finally {
      setPaying(false);
    }
  }

  async function onPaystackPay() {
    if (!orderId) return;
    setPaying(true);
    setError(null);
    try {
      const result = await initializePayment(orderId, { accessToken, email });
      setOrder(result.order);
      window.location.href = result.authorizationUrl;
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Failed to start Paystack payment",
      );
      setPaying(false);
    }
  }

  const stubAllowed =
    paymentConfig?.stubAllowed === true ||
    (paymentConfig?.provider === "stub" &&
      order?.payment?.provider === "stub");

  const canStubPay =
    order?.status === "RESERVED" &&
    order.payment?.status === "PENDING" &&
    stubAllowed &&
    (order.payment.provider === "stub" || paymentConfig?.stubAllowed);

  const canPaystack =
    order?.status === "RESERVED" &&
    order.payment?.status === "PENDING" &&
    (paymentConfig?.provider === "paystack" ||
      order.payment.provider === "paystack");

  return (
    <PublicShell>
      <div className="mb-6">
        {order ? (
          <Link
            href={`/events/${order.eventSlug}`}
            className="text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            ← Back to event
          </Link>
        ) : (
          <Link
            href="/events"
            className="text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            ← All events
          </Link>
        )}
      </div>

      {error ? (
        <Alert variant="destructive" className="mb-4">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      {verifying ? (
        <Alert className="mb-4">
          <AlertDescription>Confirming payment with Paystack…</AlertDescription>
        </Alert>
      ) : null}

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading order…</p>
      ) : order ? (
        <div className="mx-auto max-w-xl space-y-6">
          <header className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary">{order.status}</Badge>
              {order.payment ? (
                <Badge variant="outline">Payment: {order.payment.status}</Badge>
              ) : null}
            </div>
            <h1 className="font-heading text-2xl font-semibold tracking-tight">
              Order confirmation
            </h1>
            <p className="text-muted-foreground">{order.eventName}</p>
            <p className="text-xs text-muted-foreground">Order ID: {order.id}</p>
          </header>

          <section className="space-y-2 text-sm">
            <h2 className="font-heading text-lg font-semibold">Purchaser</h2>
            <p>{order.purchaserName}</p>
            <p className="text-muted-foreground">{order.purchaserEmail}</p>
            <p className="text-muted-foreground">{order.purchaserPhone}</p>
          </section>

          <section className="space-y-3">
            <h2 className="font-heading text-lg font-semibold">Items</h2>
            <ul className="divide-y divide-border overflow-hidden rounded-xl bg-background ring-1 ring-foreground/10">
              {order.items.map((item) => (
                <li
                  key={item.id}
                  className="flex items-center justify-between gap-4 px-5 py-3 text-sm"
                >
                  <span>
                    {item.quantity} × {item.ticketTypeName}
                  </span>
                  <span className="font-medium">
                    {formatMoney(item.lineTotal, order.currency)}
                  </span>
                </li>
              ))}
            </ul>
            <p className="text-right text-sm font-semibold">
              Total {formatMoney(order.totalAmount, order.currency)}
            </p>
          </section>

          {order.status === "RESERVED" && order.reservedUntil ? (
            <Alert>
              <AlertDescription>
                Inventory is reserved until{" "}
                {new Date(order.reservedUntil).toLocaleString()}. Complete payment
                before then or the hold will expire.
              </AlertDescription>
            </Alert>
          ) : null}

          {canPaystack ? (
            <section className="space-y-3 rounded-xl bg-muted/40 p-4 ring-1 ring-foreground/10">
              <h2 className="font-heading text-base font-semibold">
                Pay with Paystack
              </h2>
              <p className="text-sm text-muted-foreground">
                You will be redirected to Paystack to complete payment securely.
                Tickets are issued only after the backend verifies the charge.
              </p>
              <Button onClick={() => void onPaystackPay()} disabled={paying || verifying}>
                {paying ? "Redirecting…" : "Pay now"}
              </Button>
            </section>
          ) : null}

          {canStubPay ? (
            <section className="space-y-3 rounded-xl bg-muted/40 p-4 ring-1 ring-foreground/10">
              <h2 className="font-heading text-base font-semibold">
                Test payment (local stub)
              </h2>
              <p className="text-sm text-muted-foreground">
                Stub payments are for local testing without Paystack keys. This
                calls the API to verify payment on the backend, then issues tickets.
              </p>
              <Button
                variant={canPaystack ? "outline" : "default"}
                onClick={() => void onStubPay()}
                disabled={paying || verifying}
              >
                {paying ? "Completing…" : "Complete test payment"}
              </Button>
            </section>
          ) : null}

          {order.tickets.length > 0 ? (
            <section className="space-y-3">
              <Separator />
              <h2 className="font-heading text-lg font-semibold">Your tickets</h2>
              <ul className="space-y-3">
                {order.tickets.map((ticket) => (
                  <li
                    key={ticket.id}
                    className="flex flex-col gap-4 rounded-xl bg-background px-5 py-4 text-sm ring-1 ring-foreground/10 sm:flex-row sm:items-start"
                  >
                    <TicketQrImage
                      value={ticket.qrToken}
                      size={160}
                      label={`QR for ${ticket.ticketNumber}`}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="font-medium">{ticket.ticketTypeName}</p>
                      <p className="mt-1">
                        Ticket number:{" "}
                        <span className="font-mono">{ticket.ticketNumber}</span>
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Status: {ticket.status}
                      </p>
                      <p className="mt-2 break-all font-mono text-[10px] text-muted-foreground">
                        QR token: {ticket.qrToken}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {order.status === "CANCELLED" ? (
            <Alert variant="destructive">
              <AlertDescription>
                This order was cancelled (reservation may have expired). Inventory
                was released.
              </AlertDescription>
            </Alert>
          ) : null}
        </div>
      ) : null}
    </PublicShell>
  );
}

export default function OrderConfirmationPage() {
  return (
    <Suspense
      fallback={
        <PublicShell>
          <p className="text-sm text-muted-foreground">Loading order…</p>
        </PublicShell>
      }
    >
      <OrderConfirmationInner />
    </Suspense>
  );
}
