"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { isEventDeletable, type EventDto } from "@event-me/shared";
import { OrganizerShell } from "@/components/organizer-shell";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { DeleteEventDialog } from "@/components/delete-event-dialog";
import { EventStatusBadge } from "@/components/event-status-badge";
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
export default function OrganizerEventsPage() {
  const { token } = useAuth();
  const [events, setEvents] = useState<EventDto[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<EventDto | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const data = await listOrganizerEvents(token);
      setEvents(data);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load events");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  function openDelete(event: EventDto) {
    setDeleteTarget(event);
    setDeleteOpen(true);
  }

  return (
    <OrganizerShell
      title="Events"
      description="Create events, submit for review, and manage live events."
      actions={
        <Button render={<Link href="/organizer/events/new" />}>Create Event</Button>
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
            No events yet. Create an event with details and ticket types.
          </p>
          <Button className="mt-4" render={<Link href="/organizer/events/new" />}>
            Create Event
          </Button>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl bg-background ring-1 ring-foreground/10">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Tickets</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {events.map((event) => (
                <TableRow key={event.id}>
                  <TableCell className="font-medium">{event.name}</TableCell>
                  <TableCell>
                    <EventStatusBadge status={event.status} />
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatEventWhen(event.startsAt, event.endsAt)}
                  </TableCell>
                  <TableCell>{event.ticketTypes?.length ?? 0}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        render={<Link href={`/organizer/events/${event.id}`} />}
                      >
                        {event.status === "DRAFT" ? "Edit" : "View"}
                      </Button>
                      {isEventDeletable(event.status) ? (
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => openDelete(event)}
                        >
                          Delete
                        </Button>
                      ) : null}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <DeleteEventDialog
        token={token}
        event={deleteTarget}
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        onDeleted={load}
      />
    </OrganizerShell>
  );
}
