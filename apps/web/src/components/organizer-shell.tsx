"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import {
  CalendarDays,
  ExternalLink,
  LayoutDashboard,
  LogOut,
  Menu,
  Users,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { loginPathWithNext, useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/organizer", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { href: "/organizer/events", label: "Events", icon: CalendarDays },
  { href: "/organizer/staff", label: "Staff", icon: Users },
] as const;

export function OrganizerShell({
  title,
  description,
  children,
  actions,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  actions?: ReactNode;
}) {
  const { user, loading, clearSession, token } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    if (loading) return;
    if (!token || !user || user.role !== "ORGANIZER" || !user.organizer) {
      router.replace(loginPathWithNext(pathname));
    }
  }, [loading, token, user, router, pathname]);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  if (loading || !user?.organizer) {
    return (
      <div className="flex min-h-svh items-center justify-center bg-background text-sm text-muted-foreground">
        Loading…
      </div>
    );
  }

  function isActive(href: string, exact?: boolean) {
    if (exact) return pathname === href;
    return pathname === href || pathname.startsWith(`${href}/`);
  }

  const org = user.organizer;

  const sidebar = (
    <div className="flex h-full flex-col">
      <div className="border-b border-sidebar-border px-5 py-5">
        <Link href="/organizer" className="block">
          <p className="font-heading text-sm font-semibold tracking-tight text-sidebar-foreground">
            EventTicketing
          </p>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            {org.displayName}
            {org.status !== "APPROVED" ? ` · ${org.status}` : ""}
          </p>
        </Link>
      </div>

      <nav className="flex flex-1 flex-col gap-1 p-3">
        {NAV.map((item) => {
          const active = isActive(item.href, "exact" in item && item.exact);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors",
                active
                  ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
                  : "text-muted-foreground hover:bg-sidebar-accent/70 hover:text-sidebar-foreground",
              )}
            >
              <Icon className="size-4 shrink-0 opacity-80" aria-hidden />
              {item.label}
            </Link>
          );
        })}

        <Link
          href="/events"
          className="mt-2 flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-sidebar-accent/70 hover:text-sidebar-foreground"
        >
          <ExternalLink className="size-4 shrink-0 opacity-80" aria-hidden />
          Public site
        </Link>
      </nav>

      <div className="border-t border-sidebar-border p-3">
        <div className="mb-2 truncate px-3 text-xs text-muted-foreground">
          {user.fullName}
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start gap-2 text-muted-foreground"
          onClick={() => {
            clearSession();
            router.push("/login");
          }}
        >
          <LogOut className="size-4" aria-hidden />
          Sign out
        </Button>
      </div>
    </div>
  );

  return (
    <div className="flex min-h-svh bg-[radial-gradient(ellipse_at_top_left,_oklch(0.96_0.02_145),_oklch(0.985_0_0)_50%)]">
      <aside className="sticky top-0 hidden h-svh w-60 shrink-0 border-r border-sidebar-border bg-sidebar md:block">
        {sidebar}
      </aside>

      {mobileOpen ? (
        <div className="fixed inset-0 z-40 md:hidden">
          <button
            type="button"
            aria-label="Close menu"
            className="absolute inset-0 bg-foreground/20 backdrop-blur-[2px]"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="absolute inset-y-0 left-0 w-64 border-r border-sidebar-border bg-sidebar shadow-lg">
            <div className="absolute right-2 top-2">
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Close sidebar"
                onClick={() => setMobileOpen(false)}
              >
                <X className="size-4" />
              </Button>
            </div>
            {sidebar}
          </aside>
        </div>
      ) : null}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-border/80 bg-background/80 px-4 py-3 backdrop-blur-sm md:hidden">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Open menu"
            onClick={() => setMobileOpen(true)}
          >
            <Menu className="size-4" />
          </Button>
          <div className="min-w-0 flex-1">
            <p className="truncate font-heading text-sm font-semibold">{title}</p>
          </div>
        </header>

        <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8">
          <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
            <div className="min-w-0 space-y-1">
              <h1 className="font-heading text-2xl font-semibold tracking-tight">
                {title}
              </h1>
              {description ? (
                <p className="max-w-2xl text-sm text-muted-foreground">
                  {description}
                </p>
              ) : null}
            </div>
            {actions}
          </div>
          {children}
        </main>
      </div>
    </div>
  );
}
