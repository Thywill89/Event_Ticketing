"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import type { PublicEventDto, PublicTicketTypeDto } from "@event-ticketing/shared";
import { PublicShell } from "@/components/site-header";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { ApiError, getPublicEvent } from "@/lib/api";
import { formatEventWhen } from "@/lib/datetime";
import { formatEventStatus } from "@/lib/event-status";

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

function salesCta(event: PublicEventDto): {
  label: string;
  disabled: boolean;
  href?: string;
} {
  switch (event.status) {
    case "SALES_OPEN":
      return {
        label: "Continue to checkout",
        disabled: false,
        href: `/events/${event.slug}/checkout`,
      };
    case "SALES_PAUSED":
      return { label: "Sales temporarily paused", disabled: true };
    case "SALES_CLOSED":
      return { label: "Sales closed", disabled: true };
    case "CANCELLED":
      return { label: "Event cancelled", disabled: true };
    case "COMPLETED":
      return { label: "Event ended", disabled: true };
    case "LIVE":
      return { label: "Event is live", disabled: true };
    case "POSTPONED":
      return { label: "Event postponed", disabled: true };
    case "PUBLISHED":
    default:
      return { label: "Sales opening soon", disabled: true };
  }
}

function ticketAvailabilityLabel(tt: PublicTicketTypeDto): string {
  if (!tt.isActive) return "Unavailable";
  if (tt.quantityAvailable <= 0) return "Sold out";
  if (tt.quantityAvailable <= 10) return `${tt.quantityAvailable} left`;
  return "Available";
}

export default function PublicEventDetailPage() {
  const params = useParams<{ slug: string }>();
  const slug = params.slug;
  const [event, setEvent] = useState<PublicEventDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!slug) return;
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const data = await getPublicEvent(slug);
        if (!cancelled) setEvent(data);
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

  const cta = event ? salesCta(event) : null;

  return (
    <PublicShell>
      <div className="mb-6">
        <Link
          href="/events"
          className="text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          ← All events
        </Link>
      </div>

      {error ? (
        <Alert variant="destructive" className="mb-4">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading event…</p>
      ) : event ? (
        <article className="space-y-8">
          <header className="space-y-4">
            {event.mainImageUrl ? (
              <img
                src={event.mainImageUrl}
                alt=""
                className="aspect-[21/9] w-full object-cover"
              />
            ) : null}
            {event.galleryImages && event.galleryImages.length > 0 ? (
              <div className="flex gap-2 overflow-x-auto pb-1">
                {event.galleryImages.map((img) => (
                  <img
                    key={img.id}
                    src={img.url}
                    alt=""
                    className="h-24 w-36 shrink-0 object-cover"
                  />
                ))}
              </div>
            ) : null}
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="secondary">{formatEventStatus(event.status)}</Badge>
                {event.category ? (
                  <Badge variant="outline">{event.category}</Badge>
                ) : null}
              </div>
              <h1 className="font-heading text-3xl font-semibold tracking-tight sm:text-4xl">
                {event.name}
              </h1>
              <p className="text-muted-foreground">
                {formatEventWhen(event.startsAt, event.endsAt)}
              </p>
              <p className="text-sm text-muted-foreground">
                Presented by {event.organizerDisplayName}
              </p>
              {cta ? (
                <div className="pt-1">
                  {cta.href && !cta.disabled ? (
                    <Button render={<Link href={cta.href} />}>{cta.label}</Button>
                  ) : (
                    <Button disabled>{cta.label}</Button>
                  )}
                </div>
              ) : null}
            </div>
          </header>

          {event.description ? (
            <section className="space-y-2">
              <h2 className="font-heading text-lg font-semibold">About</h2>
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
                {event.description}
              </p>
            </section>
          ) : null}

          {event.venue ? (
            <section className="space-y-2">
              <h2 className="font-heading text-lg font-semibold">Venue</h2>
              <p className="text-sm font-medium">{event.venue.name}</p>
              <p className="text-sm text-muted-foreground">
                {event.venue.address}
                {event.venue.city ? `, ${event.venue.city}` : ""}
                {event.venue.area ? ` · ${event.venue.area}` : ""}
                {event.venue.country ? ` · ${event.venue.country}` : ""}
              </p>
              {event.venue.mapUrl ? (
                <a
                  href={event.venue.mapUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-sm text-primary underline-offset-4 hover:underline"
                >
                  View map
                </a>
              ) : null}
            </section>
          ) : null}

          {(event.dressCode ||
            event.ageRestriction ||
            event.rules ||
            event.notices ||
            event.contactDetails) && (
            <section className="space-y-3">
              <h2 className="font-heading text-lg font-semibold">Details</h2>
              <dl className="space-y-3 text-sm">
                {event.dressCode ? (
                  <div>
                    <dt className="font-medium">Dress code</dt>
                    <dd className="text-muted-foreground">{event.dressCode}</dd>
                  </div>
                ) : null}
                {event.ageRestriction ? (
                  <div>
                    <dt className="font-medium">Age restriction</dt>
                    <dd className="text-muted-foreground">{event.ageRestriction}</dd>
                  </div>
                ) : null}
                {event.rules ? (
                  <div>
                    <dt className="font-medium">Rules</dt>
                    <dd className="whitespace-pre-wrap text-muted-foreground">
                      {event.rules}
                    </dd>
                  </div>
                ) : null}
                {event.notices ? (
                  <div>
                    <dt className="font-medium">Notices</dt>
                    <dd className="whitespace-pre-wrap text-muted-foreground">
                      {event.notices}
                    </dd>
                  </div>
                ) : null}
                {event.contactDetails ? (
                  <div>
                    <dt className="font-medium">Contact</dt>
                    <dd className="whitespace-pre-wrap text-muted-foreground">
                      {event.contactDetails}
                    </dd>
                  </div>
                ) : null}
              </dl>
            </section>
          )}

          {event.socialLinks && Object.keys(event.socialLinks).length > 0 ? (
            <section className="space-y-2">
              <h2 className="font-heading text-lg font-semibold">Links</h2>
              <ul className="flex flex-wrap gap-3 text-sm">
                {Object.entries(event.socialLinks).map(([key, url]) => (
                  <li key={key}>
                    <a
                      href={url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-primary underline-offset-4 hover:underline"
                    >
                      {key}
                    </a>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <Separator />

          <section id="tickets" className="space-y-4">
            <div className="space-y-1">
              <h2 className="font-heading text-lg font-semibold">Tickets</h2>
              <p className="text-sm text-muted-foreground">
                Prices and availability. Select quantities on checkout.
              </p>
            </div>
            {!event.ticketTypes || event.ticketTypes.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No ticket types listed for this event.
              </p>
            ) : (
              <ul className="divide-y divide-border overflow-hidden rounded-xl bg-background ring-1 ring-foreground/10">
                {event.ticketTypes.map((tt) => (
                  <li
                    key={tt.id}
                    className="flex flex-col gap-2 px-5 py-4 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="space-y-1">
                      <p className="font-medium">{tt.name}</p>
                      {tt.description ? (
                        <p className="text-sm text-muted-foreground">{tt.description}</p>
                      ) : null}
                      <p className="text-xs text-muted-foreground">
                        {ticketAvailabilityLabel(tt)}
                      </p>
                    </div>
                    <p className="shrink-0 text-sm font-semibold">
                      {formatMoney(tt.price, tt.currency)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
            {cta?.href && !cta.disabled ? (
              <Button render={<Link href={cta.href} />}>{cta.label}</Button>
            ) : cta ? (
              <Button disabled>{cta.label}</Button>
            ) : null}
          </section>
        </article>
      ) : null}
    </PublicShell>
  );
}
