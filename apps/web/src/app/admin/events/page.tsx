"use client";

import { useCallback, useEffect, useState } from "react";
import type { AdminEventDto } from "@event-ticketing/shared";
import { AdminShell } from "@/components/admin-shell";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import {
  ApiError,
  approveAdminEvent,
  listAdminEvents,
  rejectAdminEvent,
} from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { formatEventWhen } from "@/lib/datetime";
import { formatEventStatus } from "@/lib/event-status";

export default function AdminEventsPage() {
  const { token } = useAuth();
  const [events, setEvents] = useState<AdminEventDto[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectTarget, setRejectTarget] = useState<AdminEventDto | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [rejectError, setRejectError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const data = await listAdminEvents(token, "PENDING_REVIEW");
      setEvents(data);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load pending events");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  async function onApprove(event: AdminEventDto) {
    if (!token) return;
    setBusyId(event.id);
    setError(null);
    try {
      await approveAdminEvent(token, event.id);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Approve failed");
    } finally {
      setBusyId(null);
    }
  }

  function openReject(event: AdminEventDto) {
    setRejectTarget(event);
    setRejectReason("");
    setRejectError(null);
    setRejectOpen(true);
  }

  async function onRejectConfirm() {
    if (!token || !rejectTarget) return;
    setBusyId(rejectTarget.id);
    setRejectError(null);
    try {
      await rejectAdminEvent(token, rejectTarget.id, {
        reason: rejectReason.trim() || undefined,
      });
      setRejectOpen(false);
      setRejectTarget(null);
      await load();
    } catch (err) {
      setRejectError(err instanceof ApiError ? err.message : "Reject failed");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <AdminShell
      title="Event review"
      description="Approve or reject organizer submissions waiting to go live."
      actions={
        <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
          Refresh
        </Button>
      }
    >
      {error ? (
        <Alert variant="destructive" className="mb-4">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading pending events…</p>
      ) : events.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-background/60 px-6 py-12 text-center">
          <p className="text-sm text-muted-foreground">
            No events waiting for review. Organizers submit drafts from their event page.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl bg-background ring-1 ring-foreground/10">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Event</TableHead>
                <TableHead>Organizer</TableHead>
                <TableHead>When</TableHead>
                <TableHead>Tickets</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {events.map((event) => (
                <TableRow key={event.id}>
                  <TableCell>
                    <div className="font-medium">{event.name}</div>
                    <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                      <Badge variant="secondary">{formatEventStatus(event.status)}</Badge>
                      <span>{event.category ?? "Uncategorized"}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="text-sm">{event.organizer.displayName}</div>
                    <div className="text-xs text-muted-foreground">
                      {event.organizer.email}
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatEventWhen(event.startsAt, event.endsAt)}
                  </TableCell>
                  <TableCell>{event.ticketTypes?.length ?? 0}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busyId === event.id}
                        onClick={() => openReject(event)}
                      >
                        Reject
                      </Button>
                      <Button
                        size="sm"
                        disabled={busyId === event.id}
                        onClick={() => void onApprove(event)}
                      >
                        {busyId === event.id ? "Working…" : "Approve"}
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Reject event</DialogTitle>
            <DialogDescription>
              Returns {rejectTarget?.name ?? "this event"} to draft so the organizer can revise.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            {rejectError ? (
              <Alert variant="destructive">
                <AlertDescription>{rejectError}</AlertDescription>
              </Alert>
            ) : null}
            <Label htmlFor="reject-reason">Reason (optional)</Label>
            <Textarea
              id="reject-reason"
              rows={3}
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="Missing venue details, unclear ticket pricing…"
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setRejectOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              disabled={busyId === rejectTarget?.id}
              onClick={() => void onRejectConfirm()}
            >
              {busyId === rejectTarget?.id ? "Rejecting…" : "Reject to draft"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminShell>
  );
}
