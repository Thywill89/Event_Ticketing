"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type {
  EventDto,
  OrganizerDashboardStatsDto,
} from "@event-ticketing/shared";
import {
  ArrowRight,
  CalendarDays,
  Plus,
  Users,
} from "lucide-react";
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
import { ApiError, getOrganizerDashboard, listOrganizerEvents } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { formatEventWhen } from "@/lib/datetime";
import { formatEventStatus } from "@/lib/event-status";

export default function OrganizerDashboardPage() {
  const { token, user } = useAuth();
  const [stats, setStats] = useState<OrganizerDashboardStatsDto | null>(null);
  const [events, setEvents] = useState<EventDto[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const [s, e] = await Promise.all([
        getOrganizerDashboard(token),
        listOrganizerEvents(token),
      ]);
      setStats(s);
      setEvents(e.slice(0, 8));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load dashboard");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  const pendingApproval = user?.organizer?.status === "PENDING";
  const suspended = user?.organizer?.status === "SUSPENDED";

  return (
    <OrganizerShell
      title="Dashboard"
      description="Overview of your events, ticket sales, and check-in progress."
      actions={
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
            Refresh
          </Button>
          <Button size="sm" render={<Link href="/organizer/events/new" />}>
            <Plus className="size-3.5" aria-hidden />
            New event
          </Button>
        </div>
      }
    >
      {pendingApproval ? (
        <Alert className="mb-6">
          <AlertDescription>
            Your organizer account is pending platform approval. You can create
            drafts and submit events for review, but publishing requires approval.
          </AlertDescription>
        </Alert>
      ) : null}
      {suspended ? (
        <Alert variant="destructive" className="mb-6">
          <AlertDescription>
            Your organizer account is suspended. Contact the platform admin.
          </AlertDescription>
        </Alert>
      ) : null}

      {error ? (
        <Alert variant="destructive" className="mb-6">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      {loading && !stats ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : stats ? (
        <>
          <section className="mb-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {[
              { label: "Upcoming events", value: String(stats.upcomingEvents) },
              { label: "Tickets sold", value: String(stats.ticketsSold) },
              { label: "Checked in", value: String(stats.checkedIn) },
              { label: "Remaining", value: String(stats.remaining) },
              {
                label: "Revenue",
                value: `${stats.currency} ${stats.revenue}`,
              },
            ].map((kpi) => (
              <div
                key={kpi.label}
                className="rounded-xl bg-background/90 px-4 py-3 ring-1 ring-foreground/10"
              >
                <p className="text-xs text-muted-foreground">{kpi.label}</p>
                <p className="mt-1 font-heading text-xl font-semibold tracking-tight">
                  {kpi.value}
                </p>
              </div>
            ))}
          </section>

          <section className="mb-8">
            <h2 className="mb-3 font-heading text-sm font-medium text-muted-foreground">
              Quick links
            </h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <Link
                href="/organizer/events"
                className="group flex flex-col gap-3 rounded-xl bg-background/90 p-4 ring-1 ring-foreground/10 transition-colors hover:ring-foreground/20"
              >
                <span className="flex size-9 items-center justify-center rounded-lg bg-muted">
                  <CalendarDays className="size-4" aria-hidden />
                </span>
                <div className="space-y-1">
                  <p className="font-medium">Manage events</p>
                  <p className="text-sm text-muted-foreground">
                    Create drafts, submit for review, and run the door.
                  </p>
                </div>
                <span className="mt-auto inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors group-hover:text-foreground">
                  Open
                  <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
                </span>
              </Link>
              <Link
                href="/organizer/staff"
                className="group flex flex-col gap-3 rounded-xl bg-background/90 p-4 ring-1 ring-foreground/10 transition-colors hover:ring-foreground/20"
              >
                <span className="flex size-9 items-center justify-center rounded-lg bg-muted">
                  <Users className="size-4" aria-hidden />
                </span>
                <div className="space-y-1">
                  <p className="font-medium">Staff accounts</p>
                  <p className="text-sm text-muted-foreground">
                    Invite door staff and assign them to events.
                  </p>
                </div>
                <span className="mt-auto inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors group-hover:text-foreground">
                  Open
                  <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
                </span>
              </Link>
            </div>
          </section>

          <section>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-heading text-sm font-medium text-muted-foreground">
                Recent events
              </h2>
              <Button variant="ghost" size="sm" render={<Link href="/organizer/events" />}>
                View all
              </Button>
            </div>

            {events.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No events yet.{" "}
                <Link href="/organizer/events/new" className="underline">
                  Create a draft
                </Link>
                .
              </p>
            ) : (
              <div className="overflow-hidden rounded-xl bg-background/90 ring-1 ring-foreground/10">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>When</TableHead>
                      <TableHead className="text-right">Open</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {events.map((event) => (
                      <TableRow key={event.id}>
                        <TableCell className="font-medium">{event.name}</TableCell>
                        <TableCell>
                          <Badge variant="secondary">
                            {formatEventStatus(event.status)}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {formatEventWhen(event.startsAt, event.endsAt)}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            size="sm"
                            variant="outline"
                            render={<Link href={`/organizer/events/${event.id}`} />}
                          >
                            Open
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </section>
        </>
      ) : null}
    </OrganizerShell>
  );
}
