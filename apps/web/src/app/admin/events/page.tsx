"use client";

import { useCallback, useEffect, useState } from "react";
import type { AdminEventDto, EventStatus } from "@event-me/shared";
import { AdminShell } from "@/components/admin-shell";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { EventStatusBadge } from "@/components/event-status-badge";
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
  deleteAdminDraftEvent,
  listAdminEvents,
  rejectAdminEvent,
} from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { formatEventWhen } from "@/lib/datetime";
import { cn } from "@/lib/utils";

type AdminEventTab = Extract<EventStatus, "PENDING_REVIEW" | "DRAFT">;

export default function AdminEventsPage() {
  const { token } = useAuth();
  const [tab, setTab] = useState<AdminEventTab>("PENDING_REVIEW");
  const [events, setEvents] = useState<AdminEventDto[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectTarget, setRejectTarget] = useState<AdminEventDto | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [rejectError, setRejectError] = useState<string | null>(null);

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<AdminEventDto | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const data = await listAdminEvents(token, tab);
      setEvents(data);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : tab === "DRAFT"
            ? "Failed to load draft events"
            : "Failed to load pending events",
      );
    } finally {
      setLoading(false);
    }
  }, [token, tab]);

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

  function openDelete(event: AdminEventDto) {
    setDeleteTarget(event);
    setDeleteError(null);
    setDeleteOpen(true);
  }

  async function onDeleteConfirm() {
    if (!token || !deleteTarget) return;
    setBusyId(deleteTarget.id);
    setDeleteError(null);
    try {
      await deleteAdminDraftEvent(token, deleteTarget.id);
      setDeleteOpen(false);
      setDeleteTarget(null);
      await load();
    } catch (err) {
      setDeleteError(err instanceof ApiError ? err.message : "Delete failed");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <AdminShell
      title="Event review"
      description="Review submissions or remove abandoned drafts."
      actions={
        <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
          Refresh
        </Button>
      }
    >
      <div className="mb-4 flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          variant={tab === "PENDING_REVIEW" ? "default" : "outline"}
          className={cn(tab === "PENDING_REVIEW" && "pointer-events-none")}
          onClick={() => setTab("PENDING_REVIEW")}
        >
          Pending review
        </Button>
        <Button
          type="button"
          size="sm"
          variant={tab === "DRAFT" ? "default" : "outline"}
          className={cn(tab === "DRAFT" && "pointer-events-none")}
          onClick={() => setTab("DRAFT")}
        >
          Drafts
        </Button>
      </div>

      {error ? (
        <Alert variant="destructive" className="mb-4">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      {loading ? (
        <p className="text-sm text-muted-foreground">
          {tab === "DRAFT" ? "Loading drafts…" : "Loading pending events…"}
        </p>
      ) : events.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-background/60 px-6 py-12 text-center">
          <p className="text-sm text-muted-foreground">
            {tab === "DRAFT"
              ? "No draft events right now."
              : "No events waiting for review. Organizers submit drafts from their event page."}
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
                      <EventStatusBadge status={event.status} />
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
                    {tab === "DRAFT" ? (
                      <Button
                        size="sm"
                        variant="destructive"
                        disabled={busyId === event.id}
                        onClick={() => openDelete(event)}
                      >
                        {busyId === event.id ? "Working…" : "Delete"}
                      </Button>
                    ) : (
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
                    )}
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

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete draft event</DialogTitle>
            <DialogDescription>
              Permanently deletes {deleteTarget?.name ?? "this draft"}. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          {deleteError ? (
            <Alert variant="destructive">
              <AlertDescription>{deleteError}</AlertDescription>
            </Alert>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDeleteOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={busyId === deleteTarget?.id}
              onClick={() => void onDeleteConfirm()}
            >
              {busyId === deleteTarget?.id ? "Deleting…" : "Delete draft"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminShell>
  );
}
