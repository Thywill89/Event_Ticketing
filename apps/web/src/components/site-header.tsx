"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";

export function SiteHeader() {
  const { user, clearSession } = useAuth();

  return (
    <header className="border-b border-border/80 bg-background/80 backdrop-blur-sm">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3">
        <nav className="flex items-center gap-4">
          <Link
            href="/"
            className="font-heading text-sm font-semibold tracking-tight"
          >
            EventTicketing
          </Link>
          <Link
            href="/events"
            className="text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            Events
          </Link>
          <Link
            href="/tickets/lookup"
            className="text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            Find ticket
          </Link>
        </nav>
        <div className="flex items-center gap-2">
          {user ? (
            <>
              {user.role === "PLATFORM_ADMIN" ? (
                <Button variant="ghost" size="sm" render={<Link href="/admin" />}>
                  Admin
                </Button>
              ) : user.role === "ORGANIZER" ? (
                <Button
                  variant="ghost"
                  size="sm"
                  render={<Link href="/organizer" />}
                >
                  Organizer
                </Button>
              ) : user.role === "CHECK_IN_STAFF" ? (
                <Button variant="ghost" size="sm" render={<Link href="/staff" />}>
                  Door
                </Button>
              ) : null}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  clearSession();
                }}
              >
                Sign out
              </Button>
            </>
          ) : (
            <>
              <Button variant="ghost" size="sm" render={<Link href="/login" />}>
                Sign in
              </Button>
              <Button size="sm" render={<Link href="/register" />}>
                Register
              </Button>
            </>
          )}
        </div>
      </div>
    </header>
  );
}

export function PublicShell({
  children,
  wide = false,
}: {
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <div className="flex min-h-svh flex-col bg-[radial-gradient(ellipse_at_top,_oklch(0.97_0.01_250),_oklch(0.985_0_0)_55%)]">
      <SiteHeader />
      <main
        className={
          wide
            ? "mx-auto w-full max-w-5xl flex-1 px-4 py-8"
            : "mx-auto w-full max-w-3xl flex-1 px-4 py-8"
        }
      >
        {children}
      </main>
    </div>
  );
}
