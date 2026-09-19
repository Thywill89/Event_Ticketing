import { Router } from "express";
import type {
  PublicEventListResponse,
  PublicEventResponse,
} from "@event-ticketing/shared";
import { PUBLIC_EVENT_STATUSES } from "@event-ticketing/shared";
import type { Prisma } from "../../prisma/generated";
import { prisma } from "../db";
import {
  isPublicEventStatus,
  publicEventInclude,
  toPublicEventDto,
} from "../lib/public-events";

export const publicEventsRouter = Router();

/**
 * GET /events
 * Lists publicly visible events with optional search/filter (plan §5.2).
 * Query: q, category, city, dateFrom, dateTo (ISO dates).
 */
publicEventsRouter.get("/events", async (req, res) => {
  const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
  const category =
    typeof req.query.category === "string" ? req.query.category.trim() : "";
  const city = typeof req.query.city === "string" ? req.query.city.trim() : "";
  const dateFromRaw =
    typeof req.query.dateFrom === "string" ? req.query.dateFrom.trim() : "";
  const dateToRaw =
    typeof req.query.dateTo === "string" ? req.query.dateTo.trim() : "";

  const dateFrom = dateFromRaw ? new Date(dateFromRaw) : null;
  const dateTo = dateToRaw ? new Date(dateToRaw) : null;
  if (dateFrom && Number.isNaN(dateFrom.getTime())) {
    res.status(400).json({ error: "Invalid dateFrom" });
    return;
  }
  if (dateTo && Number.isNaN(dateTo.getTime())) {
    res.status(400).json({ error: "Invalid dateTo" });
    return;
  }

  const where: Prisma.EventWhereInput = {
    status: { in: [...PUBLIC_EVENT_STATUSES] },
  };

  if (q) {
    where.OR = [
      { name: { contains: q, mode: "insensitive" } },
      { description: { contains: q, mode: "insensitive" } },
      { category: { contains: q, mode: "insensitive" } },
      { venue: { name: { contains: q, mode: "insensitive" } } },
      { venue: { city: { contains: q, mode: "insensitive" } } },
    ];
  }
  if (category) {
    where.category = { equals: category, mode: "insensitive" };
  }
  if (city) {
    where.venue = {
      is: {
        city: { contains: city, mode: "insensitive" },
      },
    };
  }
  if (dateFrom || dateTo) {
    where.startsAt = {
      ...(dateFrom ? { gte: dateFrom } : {}),
      ...(dateTo ? { lte: dateTo } : {}),
    };
  }

  const events = await prisma.event.findMany({
    where,
    include: {
      venue: true,
      organizer: { select: { displayName: true } },
    },
    orderBy: [{ startsAt: "asc" }, { name: "asc" }],
    take: 100,
  });

  const body: PublicEventListResponse = {
    events: events.map((event) =>
      toPublicEventDto(event, { includeTicketTypes: false }),
    ),
  };
  res.json(body);
});

/**
 * GET /events/:slugOrId
 * Public event detail with active ticket types, availability, and gallery.
 */
publicEventsRouter.get("/events/:slugOrId", async (req, res) => {
  const slugOrId = req.params.slugOrId;
  if (!slugOrId?.trim()) {
    res.status(400).json({ error: "slugOrId is required" });
    return;
  }

  const event = await prisma.event.findFirst({
    where: {
      OR: [{ slug: slugOrId }, { id: slugOrId }],
    },
    include: {
      ...publicEventInclude,
      galleryImages: {
        orderBy: [{ sortOrder: "asc" as const }, { createdAt: "asc" as const }],
      },
    },
  });

  if (!event || !isPublicEventStatus(event.status)) {
    res.status(404).json({ error: "Event not found" });
    return;
  }

  const body: PublicEventResponse = {
    event: {
      ...toPublicEventDto(event, { includeTicketTypes: true }),
      galleryImages: event.galleryImages.map((img) => ({
        id: img.id,
        url: img.url,
        sortOrder: img.sortOrder,
        createdAt: img.createdAt.toISOString(),
      })),
    },
  };
  res.json(body);
});
