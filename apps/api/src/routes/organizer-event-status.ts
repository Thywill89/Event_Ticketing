import { Router, type Request, type Response } from "express";
import type {
  EventStatus,
  OrganizerEventResponse,
} from "@event-ticketing/shared";
import { prisma } from "../db";
import { writeAuditLog } from "../lib/audit";
import { toEventDto } from "../lib/event-mappers";
import {
  resolveTransition,
  validateReadyForReview,
  type EventStatusAction,
} from "../lib/event-status";
import { notifyEventLifecycle } from "../lib/notifications";
import { requireOrganizer } from "../middleware/auth";

const eventInclude = {
  venue: true,
  ticketTypes: { orderBy: [{ sortOrder: "asc" as const }, { createdAt: "asc" as const }] },
};

async function assertOrganizerCanPublish(organizerId: string): Promise<string | null> {
  const organizer = await prisma.organizer.findUnique({
    where: { id: organizerId },
    select: { status: true },
  });
  if (!organizer) return "Organizer not found";
  if (organizer.status === "SUSPENDED") {
    return "Organizer account is suspended";
  }
  if (organizer.status !== "APPROVED") {
    return "Organizer must be approved by the platform before publishing events";
  }
  return null;
}

async function applyOrganizerTransition(
  req: Request,
  res: Response,
  action: EventStatusAction,
) {
  const organizerId = req.auth!.organizerId!;
  const eventId = String(req.params.eventId);
  const existing = await prisma.event.findFirst({
    where: { id: eventId, organizerId },
    include: {
      ticketTypes: { select: { id: true } },
    },
  });

  if (!existing) {
    res.status(404).json({ error: "Event not found" });
    return;
  }

  if (action === "submit_for_review") {
    const readyError = validateReadyForReview({
      name: existing.name,
      startsAt: existing.startsAt,
      endsAt: existing.endsAt,
      ticketTypeCount: existing.ticketTypes.length,
    });
    if (readyError) {
      res.status(400).json({ error: readyError });
      return;
    }
  }

  if (action === "publish") {
    const publishBlock = await assertOrganizerCanPublish(organizerId);
    if (publishBlock) {
      res.status(403).json({ error: publishBlock, code: "ORGANIZER_NOT_APPROVED" });
      return;
    }
  }

  const result = resolveTransition(action, existing.status as EventStatus);
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
        action: `event.${action}`,
        entityType: "Event",
        entityId: event.id,
        metadata: {
          from: existing.status,
          to: result.next,
        },
      },
      tx,
    );

    return event;
  });

  if (action === "cancel" || action === "postpone") {
    const purchasers = await prisma.order.findMany({
      where: { eventId: existing.id, status: "PAID" },
      select: { purchaserEmail: true, purchaserName: true },
      distinct: ["purchaserEmail"],
      take: 500,
    });
    void notifyEventLifecycle({
      eventId: existing.id,
      eventName: existing.name,
      status: action === "cancel" ? "CANCELLED" : "POSTPONED",
      recipients: purchasers.map((p) => ({
        email: p.purchaserEmail,
        name: p.purchaserName,
      })),
    }).catch((err) => console.error("lifecycle notify failed", err));
  }

  const body: OrganizerEventResponse = {
    event: toEventDto(updated, { includeTicketTypes: true }),
  };
  res.json(body);
}

export const organizerEventStatusRouter = Router();

organizerEventStatusRouter.use("/organizer", requireOrganizer);

/** POST /organizer/events/:eventId/submit-for-review — DRAFT → PENDING_REVIEW */
organizerEventStatusRouter.post(
  "/organizer/events/:eventId/submit-for-review",
  async (req, res) => {
    await applyOrganizerTransition(req, res, "submit_for_review");
  },
);

/** POST /organizer/events/:eventId/withdraw-review — PENDING_REVIEW → DRAFT */
organizerEventStatusRouter.post(
  "/organizer/events/:eventId/withdraw-review",
  async (req, res) => {
    await applyOrganizerTransition(req, res, "withdraw_review");
  },
);

/** POST /organizer/events/:eventId/publish — APPROVED → PUBLISHED */
organizerEventStatusRouter.post(
  "/organizer/events/:eventId/publish",
  async (req, res) => {
    await applyOrganizerTransition(req, res, "publish");
  },
);

/** POST /organizer/events/:eventId/open-sales — PUBLISHED → SALES_OPEN */
organizerEventStatusRouter.post(
  "/organizer/events/:eventId/open-sales",
  async (req, res) => {
    await applyOrganizerTransition(req, res, "open_sales");
  },
);

/** POST /organizer/events/:eventId/pause-sales — SALES_OPEN → SALES_PAUSED */
organizerEventStatusRouter.post(
  "/organizer/events/:eventId/pause-sales",
  async (req, res) => {
    await applyOrganizerTransition(req, res, "pause_sales");
  },
);

/** POST /organizer/events/:eventId/resume-sales — SALES_PAUSED → SALES_OPEN */
organizerEventStatusRouter.post(
  "/organizer/events/:eventId/resume-sales",
  async (req, res) => {
    await applyOrganizerTransition(req, res, "resume_sales");
  },
);

/** POST /organizer/events/:eventId/close-sales — SALES_OPEN|SALES_PAUSED → SALES_CLOSED */
organizerEventStatusRouter.post(
  "/organizer/events/:eventId/close-sales",
  async (req, res) => {
    await applyOrganizerTransition(req, res, "close_sales");
  },
);

/** POST /organizer/events/:eventId/go-live — sales states → LIVE (door entry) */
organizerEventStatusRouter.post(
  "/organizer/events/:eventId/go-live",
  async (req, res) => {
    await applyOrganizerTransition(req, res, "go_live");
  },
);

/** POST /organizer/events/:eventId/complete — LIVE → COMPLETED */
organizerEventStatusRouter.post(
  "/organizer/events/:eventId/complete",
  async (req, res) => {
    await applyOrganizerTransition(req, res, "complete");
  },
);

/** POST /organizer/events/:eventId/cancel — exceptional CANCELLED */
organizerEventStatusRouter.post(
  "/organizer/events/:eventId/cancel",
  async (req, res) => {
    await applyOrganizerTransition(req, res, "cancel");
  },
);

/** POST /organizer/events/:eventId/postpone — exceptional POSTPONED */
organizerEventStatusRouter.post(
  "/organizer/events/:eventId/postpone",
  async (req, res) => {
    await applyOrganizerTransition(req, res, "postpone");
  },
);
