"use client";

import type { AuthUserDto } from "@event-ticketing/shared";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  getAccessToken,
  setAccessToken,
  subscribeAccessToken,
} from "@/lib/access-token";
import { fetchMe, logoutSession, refreshAccessSession } from "@/lib/api";

type AuthContextValue = {
  token: string | null;
  user: AuthUserDto | null;
  loading: boolean;
  setSession: (token: string, user: AuthUserDto) => void;
  clearSession: () => void;
  refreshUser: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<AuthUserDto | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => subscribeAccessToken(setToken), []);

  useEffect(() => {
    let cancelled = false;

    async function hydrate() {
      try {
        const access = getAccessToken();

        if (!access) {
          // Don't block the UI on refresh — restore session in the background.
          if (!cancelled) setLoading(false);
          try {
            const refreshed = await refreshAccessSession();
            if (cancelled || !refreshed) return;
            setToken(refreshed.token);
            setUser(refreshed.user);
          } catch {
            // No refresh cookie / network — stay signed out.
          }
          return;
        }

        try {
          const { user: me } = await fetchMe(access);
          if (cancelled) return;
          setToken(access);
          setUser(me);
        } catch {
          try {
            const refreshed = await refreshAccessSession();
            if (cancelled) return;
            if (!refreshed) {
              setAccessToken(null);
              setToken(null);
              setUser(null);
              return;
            }
            setToken(refreshed.token);
            setUser(refreshed.user);
          } catch {
            setAccessToken(null);
            setToken(null);
            setUser(null);
          }
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void hydrate();
    return () => {
      cancelled = true;
    };
  }, []);

  const setSession = useCallback((nextToken: string, nextUser: AuthUserDto) => {
    setAccessToken(nextToken);
    setToken(nextToken);
    setUser(nextUser);
  }, []);

  const clearSession = useCallback(() => {
    void logoutSession().finally(() => {
      setAccessToken(null);
      setToken(null);
      setUser(null);
    });
  }, []);

  const refreshUser = useCallback(async () => {
    const access = getAccessToken();
    if (!access) return;
    const { user: me } = await fetchMe(access);
    setUser(me);
  }, []);

  const value = useMemo(
    () => ({ token, user, loading, setSession, clearSession, refreshUser }),
    [token, user, loading, setSession, clearSession, refreshUser],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return ctx;
}

/** Same-origin relative path only (blocks open redirects). */
export function safeNextPath(raw: string | null | undefined): string | null {
  if (!raw) return null;
  if (!raw.startsWith("/") || raw.startsWith("//") || raw.includes("://")) {
    return null;
  }
  return raw;
}

export function defaultHomeForRole(role: AuthUserDto["role"]): string {
  if (role === "PLATFORM_ADMIN") return "/admin";
  if (role === "CHECK_IN_STAFF") return "/staff";
  return "/organizer";
}

/** After login, honor ?next= only when the role may access that area. */
export function resolvePostLoginPath(
  role: AuthUserDto["role"],
  next: string | null | undefined,
): string {
  const path = safeNextPath(next);
  if (!path) return defaultHomeForRole(role);

  if (path === "/admin" || path.startsWith("/admin/")) {
    return role === "PLATFORM_ADMIN" ? path : defaultHomeForRole(role);
  }
  if (path === "/organizer" || path.startsWith("/organizer/")) {
    return role === "ORGANIZER" ? path : defaultHomeForRole(role);
  }
  if (path === "/staff" || path.startsWith("/staff/")) {
    return role === "CHECK_IN_STAFF" ? path : defaultHomeForRole(role);
  }

  return path;
}

export function loginPathWithNext(pathname: string): string {
  const next = safeNextPath(pathname);
  if (!next || next === "/login") return "/login";
  return `/login?next=${encodeURIComponent(next)}`;
}
