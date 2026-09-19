"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import type {
  EventStaffAssignmentDto,
  OrganizerStaffDto,
} from "@event-ticketing/shared";
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
import {
  ApiError,
  assignEventStaff,
  listEventStaff,
  listOrganizerStaff,
  unassignEventStaff,
} from "@/lib/api";
import { useAuth } from "@/lib/auth";

export default function EventStaffPage() {
  const params = useParams<{ id: string }>();
  const eventId = params.id;
  const { token } = useAuth();

  const [assigned, setAssigned] = useState<EventStaffAssignmentDto[]>([]);
  const [allStaff, setAllStaff] = useState<OrganizerStaffDto[]>([]);
  const [selected, setSelected] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!token || !eventId) return;
    setLoading(true);
    setError(null);
    try {
      const [a, s] = await Promise.all([
        listEventStaff(token, eventId),
        listOrganizerStaff(token),
      ]);
      setAssigned(a);
      setAllStaff(s.filter((x) => x.isActive));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [token, eventId]);

  useEffect(() => {
    void load();
  }, [load]);

  const assignedIds = new Set(assigned.map((a) => a.staffId));
  const available = allStaff.filter((s) => !assignedIds.has(s.id));

  async function onAssign() {
    if (!token || !eventId || !selected) return;
    setBusy(true);
    setError(null);
    try {
      await assignEventStaff(token, eventId, selected);
      setSelected("");
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Assign failed");
    } finally {
      setBusy(false);
    }
  }

  async function onRemove(staffId: string) {
    if (!token || !eventId) return;
    setBusy(true);
    setError(null);
    try {
      await unassignEventStaff(token, eventId, staffId);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Remove failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <OrganizerShell
      title="Event door staff"
      actions={
        <div className="flex gap-2">
          <Button variant="outline" render={<Link href="/organizer/staff" />}>
            Manage all staff
          </Button>
          <Button
            variant="outline"
            render={<Link href={`/organizer/events/${eventId}`} />}
          >
            Back to event
          </Button>
        </div>
      }
    >
      {error ? (
        <Alert variant="destructive" className="mb-4">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <section className="mb-6 flex flex-wrap items-end gap-3 rounded-xl bg-background p-4 ring-1 ring-foreground/10">
        <div className="min-w-[220px] flex-1 space-y-2">
          <p className="text-sm font-medium">Assign staff</p>
          <select
            className="flex h-9 w-full rounded-lg border border-input bg-transparent px-3 text-sm outline-none"
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
          >
            <option value="">Select staff…</option>
            {available.map((s) => (
              <option key={s.id} value={s.id}>
                {s.fullName} ({s.email})
              </option>
            ))}
          </select>
        </div>
        <Button disabled={busy || !selected} onClick={() => void onAssign()}>
          Assign
        </Button>
      </section>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : assigned.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No staff assigned. Create staff under Door staff, then assign here.
        </p>
      ) : (
        <div className="overflow-hidden rounded-xl bg-background ring-1 ring-foreground/10">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {assigned.map((row) => (
                <TableRow key={row.staffId}>
                  <TableCell className="font-medium">{row.fullName}</TableCell>
                  <TableCell>{row.email}</TableCell>
                  <TableCell>
                    <Badge variant={row.isActive ? "secondary" : "outline"}>
                      {row.isActive ? "Active" : "Disabled"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy}
                      onClick={() => void onRemove(row.staffId)}
                    >
                      Remove
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
