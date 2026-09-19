"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import type { OrganizerStaffDto } from "@event-ticketing/shared";
import { OrganizerShell } from "@/components/organizer-shell";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  createOrganizerStaff,
  listOrganizerStaff,
  updateOrganizerStaff,
} from "@/lib/api";
import { useAuth } from "@/lib/auth";

export default function OrganizerStaffPage() {
  const { token } = useAuth();
  const [staff, setStaff] = useState<OrganizerStaffDto[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      setStaff(await listOrganizerStaff(token));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load staff");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    if (!token) return;
    setBusy(true);
    setError(null);
    setOk(null);
    try {
      await createOrganizerStaff(token, { email, password, fullName });
      setEmail("");
      setPassword("");
      setFullName("");
      setOk("Staff account created. Assign them to an event from the event page.");
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to create staff");
    } finally {
      setBusy(false);
    }
  }

  async function toggleActive(row: OrganizerStaffDto) {
    if (!token) return;
    setBusy(true);
    setError(null);
    try {
      await updateOrganizerStaff(token, row.id, { isActive: !row.isActive });
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Update failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <OrganizerShell
      title="Door staff"
      description="Create check-in accounts, then assign them to events."
    >
      {error ? (
        <Alert variant="destructive" className="mb-4">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      {ok ? (
        <Alert className="mb-4">
          <AlertDescription>{ok}</AlertDescription>
        </Alert>
      ) : null}

      <form
        onSubmit={onCreate}
        className="mb-8 grid max-w-xl gap-4 rounded-xl bg-background p-4 ring-1 ring-foreground/10"
      >
        <div>
          <h2 className="font-heading text-sm font-medium">Invite door staff</h2>
          <p className="text-xs text-muted-foreground">
            Creates a check-in login. Then assign them on each event&apos;s Staff page.
          </p>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="fullName">Full name</Label>
          <Input
            id="fullName"
            required
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="password">Temporary password</Label>
          <Input
            id="password"
            type="password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        <Button type="submit" disabled={busy}>
          {busy ? "Saving…" : "Create staff"}
        </Button>
      </form>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : staff.length === 0 ? (
        <p className="text-sm text-muted-foreground">No staff yet.</p>
      ) : (
        <div className="overflow-hidden rounded-xl bg-background ring-1 ring-foreground/10">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Events</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {staff.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="font-medium">{row.fullName}</TableCell>
                  <TableCell>{row.email}</TableCell>
                  <TableCell>{row.assignedEventIds.length}</TableCell>
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
                      onClick={() => void toggleActive(row)}
                    >
                      {row.isActive ? "Disable" : "Enable"}
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
