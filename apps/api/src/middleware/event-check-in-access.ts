import type { NextFunction, Request, Response } from "express";
import { prisma } from "../db";

export type EventCheckInAccess =
  | { kind: "platform_admin" }
  | { kind: "organizer_owner"; organizerId: string }
  | { kind: "assigned_staff"; staffId: string; organizerId: string };

/**
 * Requires `requireAuth` first. Attaches `req.eventCheckInAccess` when the user
 * may check in / view attendance for `:eventId` (owner, assigned staff, or admin).
 */
export async function requireEventCheckInAccess(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const auth = req.auth;
    if (!auth) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }

    const eventId = String(req.params.eventId ?? "").trim();
    if (!eventId) {
      res.status(400).json({ error: "eventId is required" });
      return;
    }

    const event = await prisma.event.findUnique({
      where: { id: eventId },
      select: { id: true, organizerId: true },
    });
    if (!event) {
      res.status(404).json({ error: "Event not found", code: "EVENT_NOT_FOUND" });
      return;
    }

    if (auth.role === "PLATFORM_ADMIN") {
      req.eventCheckInAccess = { kind: "platform_admin" };
      next();
      return;
    }

    if (auth.role === "ORGANIZER" && auth.organizerId === event.organizerId) {
      req.eventCheckInAccess = {
        kind: "organizer_owner",
        organizerId: auth.organizerId,
      };
      next();
      return;
    }

    const staff = await prisma.organizerStaff.findFirst({
      where: {
        userId: auth.sub,
        organizerId: event.organizerId,
        isActive: true,
        events: { some: { eventId: event.id } },
      },
      select: { id: true, organizerId: true },
    });

    if (staff) {
      req.eventCheckInAccess = {
        kind: "assigned_staff",
        staffId: staff.id,
        organizerId: staff.organizerId,
      };
      next();
      return;
    }

    res.status(403).json({
      error: "Not authorized to check in for this event",
      code: "FORBIDDEN",
    });
  } catch (err) {
    console.error("requireEventCheckInAccess failed", err);
    res.status(500).json({ error: "Authorization check failed" });
  }
}

declare global {
  namespace Express {
    interface Request {
      eventCheckInAccess?: EventCheckInAccess;
    }
  }
}
