"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { FormEvent, useEffect, useMemo, useState } from "react";
import type { PublicEventDto, PublicTicketTypeDto } from "@event-ticketing/shared";
import { PublicShell } from "@/components/site-header";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError, createOrder, getPublicEvent } from "@/lib/api";

function formatMoney(price: string, currency: string): string {
  const amount = Number(price);
  if (Number.isFinite(amount)) {
    try {
      return new Intl.NumberFormat(undefined, {
        style: "currency",
        currency,
      }).format(amount);
    } catch {
      /* fall through */
    }
  }
  return `${currency} ${price}`;
}

function lineTotal(tt: PublicTicketTypeDto, qty: number): number {
  return Number(tt.price) * qty;
}

export default function CheckoutPage() {
  const params = useParams<{ slug: string }>();
  const slug = params.slug;
  const router = useRouter();

  const [event, setEvent] = useState<PublicEventDto | null>(null);
  const [qty, setQty] = useState<Record<string, number>>({});
  const [purchaserName, setPurchaserName] = useState("");
  const [purchaserEmail, setPurchaserEmail] = useState("");
  const [purchaserPhone, setPurchaserPhone] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!slug) return;
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const data = await getPublicEvent(slug);
        if (cancelled) return;
        setEvent(data);
        const initial: Record<string, number> = {};
        for (const tt of data.ticketTypes ?? []) {
          initial[tt.id] = 0;
        }
        setQty(initial);
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof ApiError
              ? err.status === 404
                ? "Event not found or not published yet."
                : err.message
              : "Failed to load event",
          );
          setEvent(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [slug]);

  const ticketTypes = event?.ticketTypes ?? [];
  const salesOpen = event?.status === "SALES_OPEN";

  const selectedItems = useMemo(() => {
    return ticketTypes
      .map((tt) => ({ tt, quantity: qty[tt.id] ?? 0 }))
      .filter((row) => row.quantity > 0);
  }, [ticketTypes, qty]);

  const total = useMemo(() => {
    return selectedItems.reduce(
      (sum, row) => sum + lineTotal(row.tt, row.quantity),
      0,
    );
  }, [selectedItems]);

  const currency = selectedItems[0]?.tt.currency ?? ticketTypes[0]?.currency ?? "GHS";

  function setQuantity(ticketTypeId: string, value: number, max: number) {
    const next = Math.max(0, Math.min(max, Math.floor(value) || 0));
    setQty((prev) => ({ ...prev, [ticketTypeId]: next }));
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!event) return;
    setError(null);

    if (!salesOpen) {
      setError("Sales are not open for this event.");
      return;
    }
    if (selectedItems.length === 0) {
      setError("Select at least one ticket.");
      return;
    }

    setSubmitting(true);
    try {
      const order = await createOrder(event.id, {
        purchaserName: purchaserName.trim(),
        purchaserEmail: purchaserEmail.trim(),
        purchaserPhone: purchaserPhone.trim(),
        items: selectedItems.map((row) => ({
          ticketTypeId: row.tt.id,
          quantity: row.quantity,
        })),
      });
      const params = new URLSearchParams({
        accessToken: order.accessToken,
      });
      router.push(`/orders/${order.id}?${params.toString()}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to create order");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <PublicShell>
      <div className="mb-6">
        <Link
          href={`/events/${slug}`}
          className="text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          ← Back to event
        </Link>
      </div>

      {error ? (
        <Alert variant="destructive" className="mb-4">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading checkout…</p>
      ) : event ? (
        <div className="mx-auto max-w-xl space-y-8">
          <header className="space-y-2">
            <h1 className="font-heading text-2xl font-semibold tracking-tight">
              Checkout
            </h1>
            <p className="text-muted-foreground">{event.name}</p>
            {!salesOpen ? (
              <Alert>
                <AlertDescription>
                  Sales are not open ({event.status}). You can view tickets but cannot
                  place an order.
                </AlertDescription>
              </Alert>
            ) : null}
          </header>

          <form className="space-y-8" onSubmit={onSubmit}>
            <section className="space-y-4">
              <h2 className="font-heading text-lg font-semibold">Tickets</h2>
              {ticketTypes.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No ticket types available.
                </p>
              ) : (
                <ul className="divide-y divide-border overflow-hidden rounded-xl bg-background ring-1 ring-foreground/10">
                  {ticketTypes.map((tt) => {
                    const available = Math.max(0, tt.quantityAvailable);
                    const maxQty = Math.min(20, available);
                    const disabled = !tt.isActive || available <= 0 || !salesOpen;
                    return (
                      <li
                        key={tt.id}
                        className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between"
                      >
                        <div className="space-y-1">
                          <p className="font-medium">{tt.name}</p>
                          {tt.description ? (
                            <p className="text-sm text-muted-foreground">
                              {tt.description}
                            </p>
                          ) : null}
                          <p className="text-sm font-semibold">
                            {formatMoney(tt.price, tt.currency)}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {available <= 0
                              ? "Sold out"
                              : `${available} available`}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Label htmlFor={`qty-${tt.id}`} className="sr-only">
                            Quantity for {tt.name}
                          </Label>
                          <Input
                            id={`qty-${tt.id}`}
                            type="number"
                            min={0}
                            max={maxQty}
                            disabled={disabled}
                            className="w-20"
                            value={qty[tt.id] ?? 0}
                            onChange={(e) =>
                              setQuantity(tt.id, Number(e.target.value), maxQty)
                            }
                          />
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>

            <section className="space-y-4">
              <h2 className="font-heading text-lg font-semibold">Your details</h2>
              <div className="grid gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="purchaserName">Full name</Label>
                  <Input
                    id="purchaserName"
                    required
                    maxLength={120}
                    autoComplete="name"
                    value={purchaserName}
                    onChange={(e) => setPurchaserName(e.target.value)}
                    disabled={!salesOpen}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="purchaserEmail">Email</Label>
                  <Input
                    id="purchaserEmail"
                    type="email"
                    required
                    autoComplete="email"
                    value={purchaserEmail}
                    onChange={(e) => setPurchaserEmail(e.target.value)}
                    disabled={!salesOpen}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="purchaserPhone">Phone</Label>
                  <Input
                    id="purchaserPhone"
                    type="tel"
                    required
                    minLength={5}
                    maxLength={40}
                    autoComplete="tel"
                    value={purchaserPhone}
                    onChange={(e) => setPurchaserPhone(e.target.value)}
                    disabled={!salesOpen}
                  />
                </div>
              </div>
            </section>

            <section className="flex flex-col gap-3 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm">
                <span className="text-muted-foreground">Total: </span>
                <span className="font-semibold">
                  {formatMoney(total.toFixed(2), currency)}
                </span>
              </p>
              <Button type="submit" disabled={!salesOpen || submitting}>
                {submitting ? "Reserving…" : "Place order"}
              </Button>
            </section>
          </form>
        </div>
      ) : null}
    </PublicShell>
  );
}
