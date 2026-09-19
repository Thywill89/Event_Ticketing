"use client";

import { useCallback, useEffect, useState } from "react";
import type { AdminOrganizerDto, OrganizerStatus } from "@event-ticketing/shared";
import { AdminShell } from "@/components/admin-shell";
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
  approveAdminOrganizer,
  listAdminOrganizers,
  reinstateAdminOrganizer,
  suspendAdminOrganizer,
} from "@/lib/api";
import { useAuth } from "@/lib/auth";

export default function AdminOrganizersPage() {
  const { token } = useAuth();
  const [organizers, setOrganizers] = useState<AdminOrganizerDto[]>([]);
  const [filter, setFilter] = useState<OrganizerStatus | "ALL">("PENDING");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      setOrganizers(
        await listAdminOrganizers(token, filter === "ALL" ? undefined : filter),
      );
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [token, filter]);

  useEffect(() => {
    void load();
  }, [load]);

  async function runAction(
    id: string,
    action: "approve" | "suspend" | "reinstate",
  ) {
    if (!token) return;
    setBusyId(id);
    setError(null);
    try {
      if (action === "approve") await approveAdminOrganizer(token, id);
      else if (action === "suspend") await suspendAdminOrganizer(token, id);
      else await reinstateAdminOrganizer(token, id);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Action failed");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <AdminShell
      title="Organizers"
      description="Approve applications and suspend or reinstate organizer accounts."
      actions={
        <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
          Refresh
        </Button>
      }
    >
      <div className="mb-4 flex flex-wrap gap-2">
        {(["PENDING", "APPROVED", "SUSPENDED", "ALL"] as const).map((f) => (
          <Button
            key={f}
            size="sm"
            variant={filter === f ? "default" : "outline"}
            onClick={() => setFilter(f)}
          >
            {f === "ALL" ? "All" : f.charAt(0) + f.slice(1).toLowerCase()}
          </Button>
        ))}
      </div>

      {error ? (
        <Alert variant="destructive" className="mb-4">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : organizers.length === 0 ? (
        <p className="text-sm text-muted-foreground">No organizers in this filter.</p>
      ) : (
        <div className="overflow-hidden rounded-xl bg-background ring-1 ring-foreground/10">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Organizer</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Events</TableHead>
                <TableHead>Joined</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {organizers.map((o) => (
                <TableRow key={o.id}>
                  <TableCell>
                    <div className="font-medium">{o.displayName}</div>
                    <div className="text-xs text-muted-foreground">
                      {o.fullName} · {o.email}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary">{o.status}</Badge>
                  </TableCell>
                  <TableCell>{o.eventCount}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {new Date(o.createdAt).toLocaleDateString()}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      {o.status === "PENDING" ? (
                        <Button
                          size="sm"
                          disabled={busyId === o.id}
                          onClick={() => void runAction(o.id, "approve")}
                        >
                          Approve
                        </Button>
                      ) : null}
                      {o.status === "APPROVED" ? (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={busyId === o.id}
                          onClick={() => void runAction(o.id, "suspend")}
                        >
                          Suspend
                        </Button>
                      ) : null}
                      {o.status === "SUSPENDED" ? (
                        <Button
                          size="sm"
                          disabled={busyId === o.id}
                          onClick={() => void runAction(o.id, "reinstate")}
                        >
                          Reinstate
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
    </AdminShell>
  );
}
