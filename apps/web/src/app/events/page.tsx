"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { PublicEventDto } from "@event-me/shared";
import { PublicShell } from "@/components/site-header";
import { EventStatusBadge } from "@/components/event-status-badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { ApiError, listPublicEvents } from "@/lib/api";
import { formatEventWhen } from "@/lib/datetime";

export default function PublicEventsPage() {
  const [events, setEvents] = useState<PublicEventDto[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const data = await listPublicEvents();
        if (!cancelled) setEvents(data);
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof ApiError ? err.message : "Failed to load events",
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <PublicShell wide>
      <div className="mb-6">
        <h1 className="font-heading text-3xl font-semibold tracking-tight">
          Upcoming events
        </h1>
      </div>

      {error ? (
        <Alert variant="destructive" className="mb-4">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading events…</p>
      ) : events.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-background/60 px-6 py-12 text-center">
          <p className="text-sm text-muted-foreground">
            No published events yet.
          </p>
        </div>
      ) : (
        <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {events.map((event) => (
            <li
              key={event.id}
              className="flex h-full flex-col overflow-hidden rounded-xl bg-background ring-1 ring-foreground/10 transition-shadow hover:shadow-md"
            >
              <Link href={`/events/${event.slug}`} className="group flex flex-1 flex-col">
                <div className="relative aspect-[16/10] w-full overflow-hidden bg-muted">
                  {event.mainImageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={event.mainImageUrl}
                      alt=""
                      className="size-full object-cover transition-transform duration-300 group-hover:scale-105"
                    />
                  ) : (
                    <div
                      className="flex size-full items-center justify-center text-xs font-medium uppercase tracking-wide text-muted-foreground"
                      aria-hidden
                    >
                      No cover
                    </div>
                  )}
                  <EventStatusBadge
                    status={event.status}
                    className="absolute top-3 left-3 shadow-sm"
                  />
                </div>
                <div className="flex flex-1 flex-col gap-1.5 p-4">
                  <span className="font-medium leading-snug">{event.name}</span>
                  <p className="text-sm text-muted-foreground">
                    {formatEventWhen(event.startsAt, event.endsAt)}
                  </p>
                  {event.venue ? (
                    <p className="text-sm text-muted-foreground">
                      {event.venue.name}
                      {event.venue.city ? `, ${event.venue.city}` : null}
                    </p>
                  ) : null}
                  <p className="text-xs text-muted-foreground">
                    By {event.organizerDisplayName}
                    {event.category ? ` · ${event.category}` : null}
                  </p>
                </div>
              </Link>
              <div className="flex items-center justify-between gap-2 px-4 pb-4">
                <Link
                  href={`/events/${event.slug}`}
                  className="text-sm font-medium text-primary underline-offset-4 hover:underline"
                >
                  View details
                </Link>
                {event.status === "SALES_OPEN" ? (
                  <Button size="sm" render={<Link href={`/events/${event.slug}/checkout`} />}>
                    Buy tickets
                  </Button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </PublicShell>
  );
}
