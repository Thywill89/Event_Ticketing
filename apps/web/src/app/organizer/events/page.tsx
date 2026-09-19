"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { EventDto } from "@event-ticketing/shared";
import { OrganizerShell } from "@/components/organizer-shell";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ApiError, listOrganizerEvents } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { formatEventWhen } from "@/lib/datetime";
import { formatEventStatus } from "@/lib/event-status";

export default function OrganizerEventsPage() {
  const { token } = useAuth();
  const [events, setEvents] = useState<EventDto[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const data = await listOrganizerEvents(token!);
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

  return (
    <OrganizerShell
      title="Events"
      description="Create drafts, submit for review, and manage live events."
      actions={
        <Button render={<Link href="/organizer/events/new" />}>New draft event</Button>
      }
    >
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
            No events yet. Create a draft to configure details and ticket types.
          </p>
          <Button className="mt-4" render={<Link href="/organizer/events/new" />}>
            Create draft event
          </Button>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl bg-background ring-1 ring-foreground/10">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>When</TableHead>
                <TableHead>Tickets</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {events.map((event) => (
                <TableRow key={event.id}>
                  <TableCell className="font-medium">{event.name}</TableCell>
                  <TableCell>
                    <Badge variant="secondary">{formatEventStatus(event.status)}</Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatEventWhen(event.startsAt, event.endsAt)}
                  </TableCell>
                  <TableCell>{event.ticketTypes?.length ?? 0}</TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="outline"
                      size="sm"
                      render={<Link href={`/organizer/events/${event.id}`} />}
                    >
                      {event.status === "DRAFT" ? "Edit" : "Open"}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </OrganizerShell>
  );
}
