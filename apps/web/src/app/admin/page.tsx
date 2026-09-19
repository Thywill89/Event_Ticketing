"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { AdminPlatformStatsDto } from "@event-ticketing/shared";
import {
  ArrowRight,
  CalendarClock,
  Receipt,
  Users,
} from "lucide-react";
import { AdminShell } from "@/components/admin-shell";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { ApiError, getAdminStats } from "@/lib/api";
import { useAuth } from "@/lib/auth";

const QUICK_LINKS = [
  {
    href: "/admin/events",
    title: "Event review",
    body: "Approve or reject events waiting to go live.",
    icon: CalendarClock,
    statKey: "eventsPendingReview" as const,
  },
  {
    href: "/admin/organizers",
    title: "Organizers",
    body: "Review applications and manage account status.",
    icon: Users,
    statKey: "organizersPending" as const,
  },
  {
    href: "/admin/orders",
    title: "Orders",
    body: "Inspect payments and ticket purchases across the platform.",
    icon: Receipt,
    statKey: "ordersPaid" as const,
  },
];

export default function AdminDashboardPage() {
  const { token } = useAuth();
  const [stats, setStats] = useState<AdminPlatformStatsDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      setStats(await getAdminStats(token));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load stats");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  const kpis = stats
    ? [
        { label: "Pending organizers", value: stats.organizersPending },
        { label: "Approved organizers", value: stats.organizersApproved },
        { label: "Events in review", value: stats.eventsPendingReview },
        { label: "Live events", value: stats.eventsLive },
        { label: "Paid orders", value: stats.ordersPaid },
        {
          label: "Gross revenue",
          value: `${stats.currency} ${stats.grossRevenue}`,
        },
      ]
    : [];

  return (
    <AdminShell
      title="Dashboard"
      description="Platform overview — review queues, organizers, and revenue at a glance."
      actions={
        <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
          Refresh
        </Button>
      }
    >
      {error ? (
        <Alert variant="destructive" className="mb-6">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      {loading && !stats ? (
        <p className="text-sm text-muted-foreground">Loading platform stats…</p>
      ) : (
        <>
          <section className="mb-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            {kpis.map((kpi) => (
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

          <section>
            <h2 className="mb-3 font-heading text-sm font-medium text-muted-foreground">
              Work queues
            </h2>
            <div className="grid gap-3 md:grid-cols-3">
              {QUICK_LINKS.map((item) => {
                const Icon = item.icon;
                const count = stats?.[item.statKey];
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className="group flex flex-col gap-3 rounded-xl bg-background/90 p-4 ring-1 ring-foreground/10 transition-colors hover:ring-foreground/20"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <span className="flex size-9 items-center justify-center rounded-lg bg-muted text-foreground">
                        <Icon className="size-4" aria-hidden />
                      </span>
                      {typeof count === "number" ? (
                        <span className="font-heading text-2xl font-semibold tabular-nums">
                          {count}
                        </span>
                      ) : null}
                    </div>
                    <div className="space-y-1">
                      <p className="font-medium">{item.title}</p>
                      <p className="text-sm text-muted-foreground">{item.body}</p>
                    </div>
                    <span className="mt-auto inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors group-hover:text-foreground">
                      Open
                      <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
                    </span>
                  </Link>
                );
              })}
            </div>
          </section>
        </>
      )}
    </AdminShell>
  );
}
