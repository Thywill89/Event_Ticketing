"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";

export function SiteHeader({
  tone = "default",
}: {
  tone?: "default" | "overlay";
}) {
  const { user, clearSession } = useAuth();
  const overlay = tone === "overlay";

  const ghostNavClass = cn(
    buttonVariants({ variant: "ghost", size: "sm" }),
    overlay && "text-white hover:bg-white/10 hover:text-white",
  );

  return (
    <header
      className={cn(
        overlay
          ? "absolute inset-x-0 top-0 z-20 border-b border-white/10 bg-transparent"
          : "border-b border-border/80 bg-background/80 backdrop-blur-sm",
      )}
    >
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3">
        <nav className="flex items-center gap-4">
          <Link
            href="/"
            className={cn(
              "font-heading text-sm font-semibold tracking-tight",
              overlay && "text-white",
            )}
          >
            EventMe
          </Link>
          <Link
            href="/events"
            className={cn(
              "text-sm transition-colors",
              overlay
                ? "text-white/70 hover:text-white"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            Events
          </Link>
        </nav>
        <div className="flex items-center gap-2">
          {user ? (
            <>
              {user.role === "PLATFORM_ADMIN" ? (
                <Link href="/admin" className={ghostNavClass}>
                  Admin
                </Link>
              ) : user.role === "ORGANIZER" ? (
                <Link href="/organizer" className={ghostNavClass}>
                  Organizer
                </Link>
              ) : user.role === "CHECK_IN_STAFF" ? (
                <Link href="/staff" className={ghostNavClass}>
                  Door
                </Link>
              ) : null}
              <Button
                variant="ghost"
                size="sm"
                className={overlay ? "text-white hover:bg-white/10 hover:text-white" : undefined}
                onClick={() => {
                  clearSession();
                }}
              >
                Sign out
              </Button>
            </>
          ) : (
            <Link
              href="/login"
              className={cn(
                buttonVariants({
                  variant: overlay ? "default" : "ghost",
                  size: "sm",
                }),
                overlay &&
                  "border-white/25 bg-white text-[oklch(0.18_0.02_220)] hover:bg-white/90",
              )}
            >
              Sign in
            </Link>
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
