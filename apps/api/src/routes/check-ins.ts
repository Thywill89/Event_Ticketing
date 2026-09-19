import { Router } from "express";
import { z } from "zod";
import type {
  CheckInListResponse,
  CheckInResponse,
  CheckInStatsResponse,
  StaffEventListResponse,
} from "@event-ticketing/shared";
import {
  CheckInError,
  getCheckInStats,
  listCheckIns,
  performCheckIn,
} from "../lib/check-in";
import { requireAuth } from "../middleware/auth";
import { requireEventCheckInAccess } from "../middleware/event-check-in-access";
import { prisma } from "../db";

export const checkInsRouter = Router();

const checkInBodySchema = z.object({
  code: z.string().trim().min(1).max(200),
  deviceLabel: z.string().trim().min(1).max(80).optional(),
});

function handleCheckInError(
  res: { status: (code: number) => { json: (body: unknown) => void } },
  err: unknown,
): boolean {
  if (err instanceof CheckInError) {
    const body: CheckInResponse = err.toFailureDto();
    res.status(err.status).json(body);
    return true;
  }
  return false;
}

/**
 * GET /staff/events — events assigned to the current check-in staff user.
 */
checkInsRouter.get("/staff/events", requireAuth, async (req, res) => {
  try {
    const assignments = await prisma.eventStaffAssignment.findMany({
      where: {
        staff: {
          userId: req.auth!.sub,
          isActive: true,
        },
      },
      include: {
        event: {
          select: {
            id: true,
            name: true,
            slug: true,
            status: true,
            startsAt: true,
            endsAt: true,
            organizer: { select: { displayName: true } },
          },
        },
      },
      orderBy: { event: { startsAt: "asc" } },
    });

    const body: StaffEventListResponse = {
      events: assignments.map((a) => ({
        id: a.event.id,
        name: a.event.name,
        slug: a.event.slug,
        status: a.event.status,
        startsAt: a.event.startsAt.toISOString(),
        endsAt: a.event.endsAt.toISOString(),
        organizerDisplayName: a.event.organizer.displayName,
      })),
    };
    res.json(body);
  } catch (err) {
    console.error("list staff events failed", err);
    res.status(500).json({ error: "Failed to list assigned events" });
  }
});

/**
 * POST /events/:eventId/check-ins
 * Validate QR token or ticket number and record attendance (plan §9).
 */
checkInsRouter.post(
  "/events/:eventId/check-ins",
  requireAuth,
  requireEventCheckInAccess,
  async (req, res) => {
    const eventId = String(req.params.eventId);
    const parsed = checkInBodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: "Invalid request",
        details: parsed.error.flatten(),
      });
      return;
    }

    try {
      const result = await performCheckIn({
        eventId,
        code: parsed.data.code,
        checkedInBy: req.auth!.sub,
        deviceLabel: parsed.data.deviceLabel,
      });
      const body: CheckInResponse = result;
      res.status(201).json(body);
    } catch (err) {
      if (handleCheckInError(res, err)) return;
      console.error("check-in failed", err);
      res.status(500).json({ error: "Failed to check in ticket" });
    }
  },
);

/**
 * GET /events/:eventId/check-ins/stats — sold vs checked-in counts.
 */
checkInsRouter.get(
  "/events/:eventId/check-ins/stats",
  requireAuth,
  requireEventCheckInAccess,
  async (req, res) => {
    try {
      const stats = await getCheckInStats(String(req.params.eventId));
      const body: CheckInStatsResponse = { stats };
      res.json(body);
    } catch (err) {
      if (handleCheckInError(res, err)) return;
      console.error("check-in stats failed", err);
      res.status(500).json({ error: "Failed to load check-in stats" });
    }
  },
);

/**
 * GET /events/:eventId/check-ins — recent successful check-ins.
 */
checkInsRouter.get(
  "/events/:eventId/check-ins",
  requireAuth,
  requireEventCheckInAccess,
  async (req, res) => {
    try {
      const limitRaw = req.query.limit;
      const limit =
        typeof limitRaw === "string" && limitRaw.trim()
          ? Number(limitRaw)
          : undefined;
      const checkIns = await listCheckIns(String(req.params.eventId), {
        limit: Number.isFinite(limit) ? limit : undefined,
      });
      const body: CheckInListResponse = { checkIns };
      res.json(body);
    } catch (err) {
      if (handleCheckInError(res, err)) return;
      console.error("list check-ins failed", err);
      res.status(500).json({ error: "Failed to list check-ins" });
    }
  },
);
