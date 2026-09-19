import { Router } from "express";
import { z } from "zod";
import type {
  AdminEventListResponse,
  AdminEventResponse,
  EventStatus,
} from "@event-ticketing/shared";
import { prisma } from "../db";
import { writeAuditLog } from "../lib/audit";
import { toEventDto } from "../lib/event-mappers";
import { resolveTransition } from "../lib/event-status";
import { requirePlatformAdmin } from "../middleware/auth";

const eventInclude = {
  venue: true,
  ticketTypes: { orderBy: [{ sortOrder: "asc" as const }, { createdAt: "asc" as const }] },
  organizer: {
    select: {
      id: true,
      displayName: true,
      status: true,
      user: { select: { email: true, fullName: true } },
    },
  },
};

const listQuerySchema = z.object({
  status: z
    .enum([
      "DRAFT",
      "PENDING_REVIEW",
      "APPROVED",
      "PUBLISHED",
      "SALES_OPEN",
      "SALES_PAUSED",
      "SALES_CLOSED",
      "LIVE",
      "COMPLETED",
      "CANCELLED",
      "POSTPONED",
    ])
    .optional()
    .default("PENDING_REVIEW"),
});

const rejectSchema = z.object({
  reason: z.string().trim().min(1).max(2000).optional(),
});

export const adminEventsRouter = Router();

adminEventsRouter.use("/admin", requirePlatformAdmin);

/**
 * GET /admin/events?status=PENDING_REVIEW
 * Lists events for platform review (default: pending).
 */
adminEventsRouter.get("/admin/events", async (req, res) => {
  const parsed = listQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid query", details: parsed.error.flatten() });
    return;
  }

  const events = await prisma.event.findMany({
    where: { status: parsed.data.status },
    include: eventInclude,
    orderBy: [{ updatedAt: "asc" }, { createdAt: "asc" }],
  });

  const body: AdminEventListResponse = {
    events: events.map((event) => ({
      ...toEventDto(event, { includeTicketTypes: true }),
      organizer: {
        id: event.organizer.id,
        displayName: event.organizer.displayName,
        status: event.organizer.status,
        email: event.organizer.user.email,
        fullName: event.organizer.user.fullName,
      },
    })),
  };
  res.json(body);
});

/**
 * GET /admin/events/:eventId — single event with organizer context.
 */
adminEventsRouter.get("/admin/events/:eventId", async (req, res) => {
  const event = await prisma.event.findUnique({
    where: { id: String(req.params.eventId) },
    include: eventInclude,
  });
  if (!event) {
    res.status(404).json({ error: "Event not found" });
    return;
  }

  const body: AdminEventResponse = {
    event: {
      ...toEventDto(event, { includeTicketTypes: true }),
      organizer: {
        id: event.organizer.id,
        displayName: event.organizer.displayName,
        status: event.organizer.status,
        email: event.organizer.user.email,
        fullName: event.organizer.user.fullName,
      },
    },
  };
  res.json(body);
});

/**
 * POST /admin/events/:eventId/approve — PENDING_REVIEW → APPROVED
 */
adminEventsRouter.post("/admin/events/:eventId/approve", async (req, res) => {
  const existing = await prisma.event.findUnique({
    where: { id: String(req.params.eventId) },
    include: eventInclude,
  });
  if (!existing) {
    res.status(404).json({ error: "Event not found" });
    return;
  }

  const result = resolveTransition("approve", existing.status as EventStatus);
  if (!result.ok) {
    res.status(409).json({ error: result.error, status: existing.status });
    return;
  }

  const updated = await prisma.$transaction(async (tx) => {
    const event = await tx.event.update({
      where: { id: existing.id },
      data: { status: result.next },
      include: eventInclude,
    });

    await writeAuditLog(
      {
        actorId: req.auth!.sub,
        action: "event.approve",
        entityType: "Event",
        entityId: event.id,
        metadata: { from: existing.status, to: result.next },
      },
      tx,
    );

    return event;
  });

  const body: AdminEventResponse = {
    event: {
      ...toEventDto(updated, { includeTicketTypes: true }),
      organizer: {
        id: updated.organizer.id,
        displayName: updated.organizer.displayName,
        status: updated.organizer.status,
        email: updated.organizer.user.email,
        fullName: updated.organizer.user.fullName,
      },
    },
  };
  res.json(body);
});

/**
 * POST /admin/events/:eventId/reject — PENDING_REVIEW → DRAFT
 * Optional body: { reason?: string } (stored on audit log).
 */
adminEventsRouter.post("/admin/events/:eventId/reject", async (req, res) => {
  const parsed = rejectSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request", details: parsed.error.flatten() });
    return;
  }

  const existing = await prisma.event.findUnique({
    where: { id: String(req.params.eventId) },
    include: eventInclude,
  });
  if (!existing) {
    res.status(404).json({ error: "Event not found" });
    return;
  }

  const result = resolveTransition("reject", existing.status as EventStatus);
  if (!result.ok) {
    res.status(409).json({ error: result.error, status: existing.status });
    return;
  }

  const reason = parsed.data.reason ?? null;

  const updated = await prisma.$transaction(async (tx) => {
    const event = await tx.event.update({
      where: { id: existing.id },
      data: { status: result.next },
      include: eventInclude,
    });

    await writeAuditLog(
      {
        actorId: req.auth!.sub,
        action: "event.reject",
        entityType: "Event",
        entityId: event.id,
        metadata: {
          from: existing.status,
          to: result.next,
          ...(reason ? { reason } : {}),
        },
      },
      tx,
    );

    return event;
  });

  const body: AdminEventResponse = {
    event: {
      ...toEventDto(updated, { includeTicketTypes: true }),
      organizer: {
        id: updated.organizer.id,
        displayName: updated.organizer.displayName,
        status: updated.organizer.status,
        email: updated.organizer.user.email,
        fullName: updated.organizer.user.fullName,
      },
    },
  };
  res.json(body);
});

/**
 * POST /admin/events/:eventId/unpublish — pull public/live event back to APPROVED.
 */
adminEventsRouter.post("/admin/events/:eventId/unpublish", async (req, res) => {
  const existing = await prisma.event.findUnique({
    where: { id: String(req.params.eventId) },
    include: eventInclude,
  });
  if (!existing) {
    res.status(404).json({ error: "Event not found" });
    return;
  }

  const result = resolveTransition("unpublish", existing.status as EventStatus);
  if (!result.ok) {
    res.status(409).json({ error: result.error, status: existing.status });
    return;
  }

  const updated = await prisma.$transaction(async (tx) => {
    const event = await tx.event.update({
      where: { id: existing.id },
      data: { status: result.next },
      include: eventInclude,
    });

    await writeAuditLog(
      {
        actorId: req.auth!.sub,
        action: "event.unpublish",
        entityType: "Event",
        entityId: event.id,
        metadata: { from: existing.status, to: result.next },
      },
      tx,
    );

    return event;
  });

  const body: AdminEventResponse = {
    event: {
      ...toEventDto(updated, { includeTicketTypes: true }),
      organizer: {
        id: updated.organizer.id,
        displayName: updated.organizer.displayName,
        status: updated.organizer.status,
        email: updated.organizer.user.email,
        fullName: updated.organizer.user.fullName,
      },
    },
  };
  res.json(body);
});

/**
 * POST /admin/events/:eventId/cancel — platform-forced cancellation.
 */
adminEventsRouter.post("/admin/events/:eventId/cancel", async (req, res) => {
  const existing = await prisma.event.findUnique({
    where: { id: String(req.params.eventId) },
    include: eventInclude,
  });
  if (!existing) {
    res.status(404).json({ error: "Event not found" });
    return;
  }

  const result = resolveTransition("cancel", existing.status as EventStatus);
  if (!result.ok) {
    res.status(409).json({ error: result.error, status: existing.status });
    return;
  }

  const updated = await prisma.$transaction(async (tx) => {
    const event = await tx.event.update({
      where: { id: existing.id },
      data: { status: result.next },
      include: eventInclude,
    });

    await writeAuditLog(
      {
        actorId: req.auth!.sub,
        action: "event.cancel",
        entityType: "Event",
        entityId: event.id,
        metadata: { from: existing.status, to: result.next, by: "admin" },
      },
      tx,
    );

    return event;
  });

  const body: AdminEventResponse = {
    event: {
      ...toEventDto(updated, { includeTicketTypes: true }),
      organizer: {
        id: updated.organizer.id,
        displayName: updated.organizer.displayName,
        status: updated.organizer.status,
        email: updated.organizer.user.email,
        fullName: updated.organizer.user.fullName,
      },
    },
  };
  res.json(body);
});
