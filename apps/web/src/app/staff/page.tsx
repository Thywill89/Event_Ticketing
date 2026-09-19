"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { StaffEventDto } from "@event-ticketing/shared";
import { CheckInShell } from "@/components/check-in-shell";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ApiError, listStaffEvents } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { formatEventStatus } from "@/lib/event-status";

export default function StaffHomePage() {
  const { token, user } = useAuth();
  const [events, setEvents] = useState<StaffEventDto[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const data = await listStaffEvents(token!);
        if (!cancelled) setEvents(data);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof ApiError ? err.message : "Failed to load events");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [token]);

  if (user && user.role !== "CHECK_IN_STAFF" && user.role !== "PLATFORM_ADMIN") {
    return (
      <CheckInShell title="Staff">
        <Alert>
          <AlertDescription>
            This page lists door assignments for check-in staff.{" "}
            <Link href="/organizer/events" className="underline">
              Go to organizer events
            </Link>
          </AlertDescription>
        </Alert>
      </CheckInShell>
    );
  }

  return (
    <CheckInShell title="Assigned events">
      {error ? (
        <Alert variant="destructive" className="mb-4">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : events.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No event assignments yet. Ask an organizer to seed staff with{" "}
          <code className="text-xs">npm run db:seed-check-in-staff -- --eventId=…</code>
        </p>
      ) : (
        <ul className="space-y-3">
          {events.map((ev) => (
            <li
              key={ev.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-background px-4 py-3 ring-1 ring-foreground/10"
            >
              <div>
                <p className="font-medium">{ev.name}</p>
                <p className="text-xs text-muted-foreground">
                  {ev.organizerDisplayName} ·{" "}
                  {new Date(ev.startsAt).toLocaleString()}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="secondary">{formatEventStatus(ev.status)}</Badge>
                <Button render={<Link href={`/organizer/events/${ev.id}/check-in`} />}>
                  Open check-in
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </CheckInShell>
  );
}
