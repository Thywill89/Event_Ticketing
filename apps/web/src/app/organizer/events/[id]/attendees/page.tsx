"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import type { OrganizerAttendeeDto } from "@event-ticketing/shared";
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
import { ApiError, listOrganizerEventAttendees } from "@/lib/api";
import { useAuth } from "@/lib/auth";

export default function EventAttendeesPage() {
  const params = useParams<{ id: string }>();
  const eventId = params.id;
  const { token } = useAuth();
  const [rows, setRows] = useState<OrganizerAttendeeDto[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!token || !eventId) return;
    setLoading(true);
    setError(null);
    try {
      setRows(await listOrganizerEventAttendees(token, eventId));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load attendees");
    } finally {
      setLoading(false);
    }
  }, [token, eventId]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <OrganizerShell
      title="Attendees"
      actions={
        <Button
          variant="outline"
          render={<Link href={`/organizer/events/${eventId}`} />}
        >
          Back to event
        </Button>
      }
    >
      {error ? (
        <Alert variant="destructive" className="mb-4">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">No issued tickets yet.</p>
      ) : (
        <div className="overflow-hidden rounded-xl bg-background ring-1 ring-foreground/10">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Ticket #</TableHead>
                <TableHead>Attendee</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Checked in</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.ticketId}>
                  <TableCell className="font-mono text-sm">
                    {row.ticketNumber}
                  </TableCell>
                  <TableCell>
                    <div>{row.attendeeName ?? "—"}</div>
                    <div className="text-xs text-muted-foreground">
                      {row.attendeeEmail ?? ""}
                    </div>
                  </TableCell>
                  <TableCell>{row.ticketTypeName}</TableCell>
                  <TableCell>
                    <Badge variant="secondary">{row.status}</Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {row.checkedInAt
                      ? new Date(row.checkedInAt).toLocaleString()
                      : "—"}
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
