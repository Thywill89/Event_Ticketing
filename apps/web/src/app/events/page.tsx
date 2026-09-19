"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";
import type { PublicEventDto } from "@event-ticketing/shared";
import { PublicShell } from "@/components/site-header";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError, listPublicEvents } from "@/lib/api";
import { formatEventWhen } from "@/lib/datetime";
import { formatEventStatus } from "@/lib/event-status";

export default function PublicEventsPage() {
  const [events, setEvents] = useState<PublicEventDto[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [category, setCategory] = useState("");
  const [city, setCity] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const load = useCallback(async (filters?: {
    q?: string;
    category?: string;
    city?: string;
    dateFrom?: string;
    dateTo?: string;
  }) => {
    setLoading(true);
    setError(null);
    try {
      const data = await listPublicEvents({
        q: filters?.q || undefined,
        category: filters?.category || undefined,
        city: filters?.city || undefined,
        dateFrom: filters?.dateFrom
          ? new Date(filters.dateFrom).toISOString()
          : undefined,
        dateTo: filters?.dateTo
          ? new Date(`${filters.dateTo}T23:59:59`).toISOString()
          : undefined,
      });
      setEvents(data);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load events");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function onSearch(e: FormEvent) {
    e.preventDefault();
    void load({ q, category, city, dateFrom, dateTo });
  }

  return (
    <PublicShell wide>
      <div className="mb-6 space-y-2">
        <h1 className="font-heading text-3xl font-semibold tracking-tight">
          Upcoming events
        </h1>
        <p className="text-muted-foreground">
          Search and filter published events, then buy tickets without an account.
        </p>
      </div>

      <form
        onSubmit={onSearch}
        className="mb-8 grid gap-3 rounded-xl bg-background p-4 ring-1 ring-foreground/10 sm:grid-cols-2 lg:grid-cols-5"
      >
        <div className="grid gap-1.5 lg:col-span-2">
          <Label htmlFor="q">Search</Label>
          <Input
            id="q"
            placeholder="Name, venue, keyword…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="category">Category</Label>
          <Input
            id="category"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="city">City</Label>
          <Input
            id="city"
            value={city}
            onChange={(e) => setCity(e.target.value)}
          />
        </div>
        <div className="grid gap-1.5 sm:col-span-2 lg:col-span-1">
          <Label className="opacity-0">Go</Label>
          <Button type="submit">Search</Button>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="dateFrom">From</Label>
          <Input
            id="dateFrom"
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="dateTo">To</Label>
          <Input
            id="dateTo"
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
          />
        </div>
      </form>

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
            No matching published events.
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-xl bg-background ring-1 ring-foreground/10">
          {events.map((event) => (
            <li key={event.id}>
              <Link
                href={`/events/${event.slug}`}
                className="flex flex-col gap-2 px-5 py-4 transition-colors hover:bg-muted/40 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{event.name}</span>
                    <Badge variant="secondary">
                      {formatEventStatus(event.status)}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {formatEventWhen(event.startsAt, event.endsAt)}
                    {event.venue
                      ? ` · ${event.venue.name}${event.venue.city ? `, ${event.venue.city}` : ""}`
                      : null}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    By {event.organizerDisplayName}
                    {event.category ? ` · ${event.category}` : null}
                  </p>
                </div>
                <span className="shrink-0 text-sm font-medium text-primary">
                  View details
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </PublicShell>
  );
}
