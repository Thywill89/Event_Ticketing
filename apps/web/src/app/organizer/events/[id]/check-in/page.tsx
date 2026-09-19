"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { FormEvent, useCallback, useEffect, useState } from "react";
import type {
  CheckInListItemDto,
  CheckInResponse,
  CheckInStatsDto,
  EventStatus,
} from "@event-ticketing/shared";
import { CHECK_IN_ALLOWED_EVENT_STATUSES } from "@event-ticketing/shared";
import { CheckInShell } from "@/components/check-in-shell";
import { QrScanner } from "@/components/qr-scanner";
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
  getCheckInStats,
  getOrganizerEvent,
  listCheckIns,
  performCheckIn,
} from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { formatEventStatus } from "@/lib/event-status";

function entryAllowed(status: EventStatus | null): boolean {
  if (!status) return false;
  return (CHECK_IN_ALLOWED_EVENT_STATUSES as readonly string[]).includes(status);
}

export default function EventCheckInPage() {
  const params = useParams<{ id: string }>();
  const eventId = params.id;
  const { token, user } = useAuth();

  const [eventName, setEventName] = useState<string>("Check-in");
  const [eventStatus, setEventStatus] = useState<EventStatus | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<CheckInResponse | null>(null);
  const [stats, setStats] = useState<CheckInStatsDto | null>(null);
  const [recent, setRecent] = useState<CheckInListItemDto[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);

  const refreshMeta = useCallback(async () => {
    if (!token || !eventId) return;
    setLoadError(null);
    try {
      const [statsData, listData] = await Promise.all([
        getCheckInStats(token, eventId),
        listCheckIns(token, eventId, 25),
      ]);
      setStats(statsData);
      setRecent(listData);
      setEventName(statsData.eventName);
      setEventStatus(statsData.eventStatus);

      if (user?.role === "ORGANIZER") {
        try {
          const ev = await getOrganizerEvent(token, eventId);
          setEventName(ev.name);
          setEventStatus(ev.status);
        } catch {
          /* stats already populated name/status */
        }
      }
    } catch (err) {
      setLoadError(
        err instanceof ApiError ? err.message : "Failed to load check-in data",
      );
    }
  }, [token, eventId, user?.role]);

  useEffect(() => {
    void refreshMeta();
  }, [refreshMeta]);

  async function submitCode(raw: string) {
    const trimmed = raw.trim();
    if (!token || !eventId || !trimmed || busy) return;

    setBusy(true);
    setResult(null);
    try {
      const data = await performCheckIn(token, eventId, {
        code: trimmed,
        deviceLabel: "web-door",
      });
      setResult(data);
      setCode("");
      await refreshMeta();
    } catch (err) {
      if (err instanceof ApiError && err.checkIn) {
        setResult(err.checkIn);
      } else {
        setResult({
          ok: false,
          code: "TICKET_NOT_FOUND",
          message:
            err instanceof ApiError ? err.message : "Check-in request failed",
        });
      }
      await refreshMeta();
    } finally {
      setBusy(false);
    }
  }

  function onManualSubmit(e: FormEvent) {
    e.preventDefault();
    void submitCode(code);
  }

  const backHref =
    user?.role === "CHECK_IN_STAFF"
      ? "/staff"
      : user?.role === "PLATFORM_ADMIN"
        ? "/admin/events"
        : `/organizer/events/${eventId}`;

  return (
    <CheckInShell
      title={eventName}
      actions={
        <div className="flex items-center gap-2">
          {eventStatus ? (
            <Badge variant="secondary">{formatEventStatus(eventStatus)}</Badge>
          ) : null}
          <Button variant="outline" render={<Link href={backHref} />}>
            Back
          </Button>
        </div>
      }
    >
      {loadError ? (
        <Alert variant="destructive" className="mb-4">
          <AlertDescription>{loadError}</AlertDescription>
        </Alert>
      ) : null}

      {stats ? (
        <section className="mb-6 grid grid-cols-3 gap-3 rounded-xl bg-background p-4 text-center ring-1 ring-foreground/10">
          <div>
            <p className="text-2xl font-semibold tabular-nums">{stats.ticketsSold}</p>
            <p className="text-xs text-muted-foreground">Sold</p>
          </div>
          <div>
            <p className="text-2xl font-semibold tabular-nums">{stats.checkedIn}</p>
            <p className="text-xs text-muted-foreground">Checked in</p>
          </div>
          <div>
            <p className="text-2xl font-semibold tabular-nums">{stats.notCheckedIn}</p>
            <p className="text-xs text-muted-foreground">Remaining</p>
          </div>
        </section>
      ) : null}

      {!entryAllowed(eventStatus) && eventStatus ? (
        <Alert className="mb-4">
          <AlertDescription>
            Entry is closed for status {formatEventStatus(eventStatus)}. Move the
            event to sales open / live to admit guests.
          </AlertDescription>
        </Alert>
      ) : null}

      <section className="mb-6 space-y-4 rounded-xl bg-background p-4 ring-1 ring-foreground/10">
        <div>
          <h2 className="font-heading text-sm font-medium">Scan or enter ticket</h2>
          <p className="text-xs text-muted-foreground">
            Paste the QR token or ticket number (e.g. EVT-8F4K7P). Camera scan is
            optional.
          </p>
        </div>

        <form onSubmit={onManualSubmit} className="grid gap-3">
          <div className="grid gap-2">
            <Label htmlFor="code">QR token or ticket number</Label>
            <Input
              id="code"
              autoComplete="off"
              autoFocus
              placeholder="Paste code…"
              value={code}
              disabled={busy}
              onChange={(e) => setCode(e.target.value)}
            />
          </div>
          <Button type="submit" disabled={busy || !code.trim()}>
            {busy ? "Checking…" : "Check in"}
          </Button>
        </form>

        <QrScanner
          disabled={busy}
          onScan={(text) => {
            setCode(text);
            void submitCode(text);
          }}
        />
      </section>

      {result ? (
        <section
          className={
            result.ok
              ? "mb-6 rounded-xl border border-emerald-600/30 bg-emerald-50 p-4 text-emerald-950"
              : "mb-6 rounded-xl border border-destructive/30 bg-destructive/5 p-4"
          }
        >
          <p className="font-heading text-lg font-semibold">
            {result.ok ? "✓ Entry approved" : "✗ Entry denied"}
          </p>
          <p className="mt-1 text-sm">{result.message}</p>
          {"ticket" in result && result.ticket ? (
            <dl className="mt-3 grid gap-1 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Ticket</dt>
                <dd className="font-mono">{result.ticket.ticketNumber}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Type</dt>
                <dd>{result.ticket.ticketTypeName}</dd>
              </div>
              {result.ticket.attendeeName ? (
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">Attendee</dt>
                  <dd>{result.ticket.attendeeName}</dd>
                </div>
              ) : null}
              {!result.ok && result.code ? (
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">Code</dt>
                  <dd className="font-mono text-xs">{result.code}</dd>
                </div>
              ) : null}
            </dl>
          ) : null}
        </section>
      ) : null}

      <section className="space-y-3">
        <h2 className="font-heading text-lg font-semibold tracking-tight">
          Recent check-ins
        </h2>
        {recent.length === 0 ? (
          <p className="text-sm text-muted-foreground">No check-ins yet.</p>
        ) : (
          <div className="overflow-hidden rounded-xl bg-background ring-1 ring-foreground/10">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Time</TableHead>
                  <TableHead>Ticket</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Attendee</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recent.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="whitespace-nowrap text-xs">
                      {new Date(row.checkedInAt).toLocaleString()}
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {row.ticketNumber}
                    </TableCell>
                    <TableCell>{row.ticketTypeName}</TableCell>
                    <TableCell>{row.attendeeName ?? "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>
    </CheckInShell>
  );
}
