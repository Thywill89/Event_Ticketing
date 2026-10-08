"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  createOrderSchema,
  type CreateOrderItemRequest,
  type CreateOrderRequest,
  type PublicEventDto,
  type PublicTicketTypeDto,
} from "@event-me/shared";
import { PublicShell } from "@/components/site-header";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/field-error";
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

function toOrderItems(qty: Record<string, number>): CreateOrderItemRequest[] {
  return Object.entries(qty)
    .filter(([, quantity]) => quantity > 0)
    .map(([ticketTypeId, quantity]) => ({ ticketTypeId, quantity }));
}

export default function CheckoutPage() {
  const params = useParams<{ slug: string }>();
  const slug = params.slug;
  const router = useRouter();

  const [event, setEvent] = useState<PublicEventDto | null>(null);
  const [qty, setQty] = useState<Record<string, number>>({});
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const {
    register,
    handleSubmit,
    setValue,
    setError: setFormError,
    formState: { errors, isSubmitting, isSubmitted },
  } = useForm<CreateOrderRequest>({
    resolver: zodResolver(createOrderSchema),
    defaultValues: {
      purchaserName: "",
      purchaserEmail: "",
      purchaserPhone: "",
      items: [],
    },
  });

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
        const preselected = new URLSearchParams(window.location.search).get("ticket");
        const initial: Record<string, number> = {};
        for (const tt of data.ticketTypes ?? []) {
          initial[tt.id] =
            tt.id === preselected && tt.isActive && tt.quantityAvailable > 0 ? 1 : 0;
        }
        setQty(initial);
        setValue("items", toOrderItems(initial));
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
  }, [slug, setValue]);

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
    const nextQty = {
      ...qty,
      [ticketTypeId]: Math.max(0, Math.min(max, Math.floor(value) || 0)),
    };
    setQty(nextQty);
    setValue("items", toOrderItems(nextQty), { shouldValidate: isSubmitted });
  }

  async function onSubmit(values: CreateOrderRequest) {
    if (!event) return;
    if (!salesOpen) {
      setFormError("root", { message: "Sales are not open for this event." });
      return;
    }

    try {
      const order = await createOrder(event.id, values);
      const params = new URLSearchParams({
        accessToken: order.accessToken,
      });
      router.push(`/orders/${order.id}?${params.toString()}`);
    } catch (err) {
      setFormError("root", {
        message: err instanceof ApiError ? err.message : "Failed to create order",
      });
    }
  }

  const bannerError = error ?? errors.root?.message;

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

      {bannerError ? (
        <Alert variant="destructive" className="mb-4">
          <AlertDescription>{bannerError}</AlertDescription>
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

          <form className="space-y-8" noValidate onSubmit={handleSubmit(onSubmit)}>
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
              <FieldError message={errors.items?.message} />
            </section>

            <section className="space-y-4">
              <h2 className="font-heading text-lg font-semibold">Your details</h2>
              <div className="grid gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="purchaserName">Full name</Label>
                  <Input
                    id="purchaserName"
                    autoComplete="name"
                    aria-invalid={errors.purchaserName ? true : undefined}
                    {...register("purchaserName", { disabled: !salesOpen })}
                  />
                  <FieldError message={errors.purchaserName?.message} />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="purchaserEmail">Email</Label>
                  <Input
                    id="purchaserEmail"
                    type="email"
                    autoComplete="email"
                    aria-invalid={errors.purchaserEmail ? true : undefined}
                    {...register("purchaserEmail", { disabled: !salesOpen })}
                  />
                  <FieldError message={errors.purchaserEmail?.message} />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="purchaserPhone">Phone</Label>
                  <Input
                    id="purchaserPhone"
                    type="tel"
                    autoComplete="tel"
                    aria-invalid={errors.purchaserPhone ? true : undefined}
                    {...register("purchaserPhone", { disabled: !salesOpen })}
                  />
                  <FieldError message={errors.purchaserPhone?.message} />
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
              <Button type="submit" disabled={!salesOpen || isSubmitting}>
                {isSubmitting ? "Reserving…" : "Place order"}
              </Button>
            </section>
          </form>
        </div>
      ) : null}
    </PublicShell>
  );
}
