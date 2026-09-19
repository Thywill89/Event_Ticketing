import type { NextFunction, Request, Response } from "express";
import type { UserRole } from "@event-ticketing/shared";
import { verifyAccessToken, type AccessTokenPayload } from "../lib/jwt";
import { prisma } from "../db";

export type AuthUser = AccessTokenPayload & {
  isActive: boolean;
};

declare global {
  namespace Express {
    interface Request {
      auth?: AuthUser;
    }
  }
}

function extractBearerToken(header: string | undefined): string | null {
  if (!header) return null;
  const [scheme, token] = header.split(" ");
  if (scheme?.toLowerCase() !== "bearer" || !token) return null;
  return token;
}

/** Requires a valid JWT. Attaches `req.auth`. */
export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const token = extractBearerToken(req.header("authorization"));
    if (!token) {
      res.status(401).json({ error: "Missing or invalid Authorization header" });
      return;
    }

    const payload = verifyAccessToken(token);
    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, isActive: true, role: true, email: true },
    });

    if (!user || !user.isActive) {
      res.status(401).json({ error: "Account inactive or not found" });
      return;
    }

    req.auth = {
      ...payload,
      email: user.email,
      role: user.role as UserRole,
      isActive: user.isActive,
    };
    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired token" });
  }
}

/** Requires authenticated organizer (User.role === ORGANIZER + organizer profile). */
export async function requireOrganizer(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const token = extractBearerToken(req.header("authorization"));
    if (!token) {
      res.status(401).json({ error: "Missing or invalid Authorization header" });
      return;
    }

    const payload = verifyAccessToken(token);
    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      select: {
        id: true,
        isActive: true,
        role: true,
        email: true,
        organizer: { select: { id: true } },
      },
    });

    if (!user || !user.isActive) {
      res.status(401).json({ error: "Account inactive or not found" });
      return;
    }

    if (user.role !== "ORGANIZER" || !user.organizer) {
      res.status(403).json({ error: "Organizer role required" });
      return;
    }

    req.auth = {
      sub: user.id,
      email: user.email,
      role: user.role as UserRole,
      organizerId: user.organizer.id,
      isActive: user.isActive,
    };
    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired token" });
  }
}

/** Requires authenticated platform admin (User.role === PLATFORM_ADMIN). */
export async function requirePlatformAdmin(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const token = extractBearerToken(req.header("authorization"));
    if (!token) {
      res.status(401).json({ error: "Missing or invalid Authorization header" });
      return;
    }

    const payload = verifyAccessToken(token);
    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, isActive: true, role: true, email: true },
    });

    if (!user || !user.isActive) {
      res.status(401).json({ error: "Account inactive or not found" });
      return;
    }

    if (user.role !== "PLATFORM_ADMIN") {
      res.status(403).json({ error: "Platform admin role required" });
      return;
    }

    req.auth = {
      sub: user.id,
      email: user.email,
      role: user.role as UserRole,
      organizerId: null,
      isActive: user.isActive,
    };
    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired token" });
  }
}
