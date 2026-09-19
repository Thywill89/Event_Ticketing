"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { loginPathWithNext, useAuth } from "@/lib/auth";

const ALLOWED_ROLES = new Set(["ORGANIZER", "PLATFORM_ADMIN", "CHECK_IN_STAFF"]);

/** Auth shell for door check-in (organizer, admin, or assigned staff). */
export function CheckInShell({
  title,
  children,
  actions,
}: {
  title: string;
  children: ReactNode;
  actions?: ReactNode;
}) {
  const { user, loading, clearSession, token } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (loading) return;
    if (!token || !user || !ALLOWED_ROLES.has(user.role)) {
      router.replace(loginPathWithNext(pathname));
    }
  }, [loading, token, user, router, pathname]);

  if (loading || !user || !ALLOWED_ROLES.has(user.role)) {
    return (
      <div className="flex min-h-svh items-center justify-center bg-background text-sm text-muted-foreground">
        Loading…
      </div>
    );
  }

  const homeHref =
    user.role === "PLATFORM_ADMIN"
      ? "/admin"
      : user.role === "CHECK_IN_STAFF"
        ? "/staff"
        : "/organizer/events";

  return (
    <div className="min-h-svh bg-[radial-gradient(ellipse_at_top,_oklch(0.97_0.01_250),_oklch(0.985_0_0)_55%)]">
      <header className="border-b border-border/80 bg-background/80 backdrop-blur-sm">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-4 py-3">
          <div className="flex items-center gap-4">
            <Link href={homeHref} className="font-heading text-sm font-semibold tracking-tight">
              EventTicketing
            </Link>
            <span className="hidden text-sm text-muted-foreground sm:inline">
              Door check-in · {user.fullName}
            </span>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              clearSession();
              router.push("/login");
            }}
          >
            Sign out
          </Button>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-8">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <h1 className="font-heading text-2xl font-semibold tracking-tight">{title}</h1>
          {actions}
        </div>
        {children}
      </main>
    </div>
  );
}
