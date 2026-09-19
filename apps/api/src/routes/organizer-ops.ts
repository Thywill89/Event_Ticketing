import { Router } from "express";
import { z } from "zod";
import type {
  EventGalleryResponse,
  OrganizerAttendeeListResponse,
  OrganizerDashboardResponse,
  OrganizerOrderListResponse,
} from "@event-ticketing/shared";
import { Prisma } from "../../prisma/generated";
import { prisma } from "../db";
import { writeAuditLog } from "../lib/audit";
import { requireOrganizer } from "../middleware/auth";

export const organizerOpsRouter = Router();

organizerOpsRouter.use("/organizer", requireOrganizer);

/**
 * GET /organizer/dashboard — KPI snapshot (plan §10.1).
 */
organizerOpsRouter.get("/organizer/dashboard", async (req, res) => {
  const organizerId = req.auth!.organizerId!;
  const now = new Date();

  const events = await prisma.event.findMany({
    where: { organizerId },
    select: {
      id: true,
      status: true,
      startsAt: true,
      ticketTypes: {
        select: {
          quantityTotal: true,
          quantitySold: true,
          quantityReserved: true,
        },
      },
    },
  });

  const upcomingEvents = events.filter(
    (e) =>
      e.startsAt >= now &&
      !["CANCELLED", "COMPLETED"].includes(e.status),
  ).length;

  let ticketsSold = 0;
  let remaining = 0;
  for (const e of events) {
    for (const tt of e.ticketTypes) {
      ticketsSold += tt.quantitySold;
      remaining += Math.max(
        0,
        tt.quantityTotal - tt.quantityReserved - tt.quantitySold,
      );
    }
  }

  const eventIds = events.map((e) => e.id);

  const [checkedIn, revenueAgg] = await Promise.all([
    eventIds.length
      ? prisma.checkIn.count({ where: { eventId: { in: eventIds } } })
      : Promise.resolve(0),
    eventIds.length
      ? prisma.order.aggregate({
          where: { eventId: { in: eventIds }, status: "PAID" },
          _sum: { totalAmount: true },
        })
      : Promise.resolve({
          _sum: { totalAmount: null as Prisma.Decimal | null },
        }),
  ]);

  const body: OrganizerDashboardResponse = {
    stats: {
      upcomingEvents,
      ticketsSold,
      checkedIn,
      remaining,
      revenue: (revenueAgg._sum.totalAmount ?? new Prisma.Decimal(0)).toFixed(2),
      currency: "GHS",
    },
  };
  res.json(body);
});

/**
 * GET /organizer/events/:eventId/orders — sales records (plan §10.3).
 */
organizerOpsRouter.get("/organizer/events/:eventId/orders", async (req, res) => {
  const organizerId = req.auth!.organizerId!;
  const eventId = String(req.params.eventId);

  const event = await prisma.event.findFirst({
    where: { id: eventId, organizerId },
    select: { id: true },
  });
  if (!event) {
    res.status(404).json({ error: "Event not found" });
    return;
  }

  const orders = await prisma.order.findMany({
    where: { eventId },
    include: {
      payment: { select: { status: true } },
      _count: { select: { tickets: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  const body: OrganizerOrderListResponse = {
    orders: orders.map((o) => ({
      id: o.id,
      status: o.status,
      purchaserName: o.purchaserName,
      purchaserEmail: o.purchaserEmail,
      purchaserPhone: o.purchaserPhone,
      totalAmount: o.totalAmount.toFixed(2),
      currency: o.currency,
      paymentStatus: o.payment?.status ?? null,
      ticketCount: o._count.tickets,
      createdAt: o.createdAt.toISOString(),
    })),
  };
  res.json(body);
});

/**
 * GET /organizer/events/:eventId/attendees — attendance / ticket roster (plan §10.4).
 */
organizerOpsRouter.get(
  "/organizer/events/:eventId/attendees",
  async (req, res) => {
    const organizerId = req.auth!.organizerId!;
    const eventId = String(req.params.eventId);

    const event = await prisma.event.findFirst({
      where: { id: eventId, organizerId },
      select: { id: true },
    });
    if (!event) {
      res.status(404).json({ error: "Event not found" });
      return;
    }

    const tickets = await prisma.ticket.findMany({
      where: {
        eventId,
        status: { in: ["ISSUED", "CHECKED_IN", "PAID"] },
      },
      include: {
        ticketType: { select: { name: true } },
        checkIn: { select: { checkedInAt: true } },
        order: { select: { id: true, createdAt: true } },
      },
      orderBy: [{ createdAt: "asc" }],
      take: 2000,
    });

    const body: OrganizerAttendeeListResponse = {
      attendees: tickets.map((t) => ({
        ticketId: t.id,
        ticketNumber: t.ticketNumber,
        ticketTypeName: t.ticketType.name,
        status: t.status,
        attendeeName: t.attendeeName,
        attendeeEmail: t.attendeeEmail,
        checkedInAt: t.checkIn?.checkedInAt.toISOString() ?? null,
        orderId: t.order.id,
        purchasedAt: t.order.createdAt.toISOString(),
      })),
    };
    res.json(body);
  },
);

const addGallerySchema = z.object({
  url: z.string().trim().url().max(2000),
  sortOrder: z.number().int().min(0).max(1000).optional(),
});

/**
 * GET /organizer/events/:eventId/gallery
 */
organizerOpsRouter.get("/organizer/events/:eventId/gallery", async (req, res) => {
  const organizerId = req.auth!.organizerId!;
  const eventId = String(req.params.eventId);

  const event = await prisma.event.findFirst({
    where: { id: eventId, organizerId },
    select: { id: true },
  });
  if (!event) {
    res.status(404).json({ error: "Event not found" });
    return;
  }

  const images = await prisma.eventGalleryImage.findMany({
    where: { eventId },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });

  const body: EventGalleryResponse = {
    images: images.map((img) => ({
      id: img.id,
      url: img.url,
      sortOrder: img.sortOrder,
      createdAt: img.createdAt.toISOString(),
    })),
  };
  res.json(body);
});

/**
 * POST /organizer/events/:eventId/gallery — add image URL (cloud upload later).
 */
organizerOpsRouter.post(
  "/organizer/events/:eventId/gallery",
  async (req, res) => {
    const organizerId = req.auth!.organizerId!;
    const eventId = String(req.params.eventId);
    const parsed = addGallerySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid request", details: parsed.error.flatten() });
      return;
    }

    const event = await prisma.event.findFirst({
      where: { id: eventId, organizerId },
      select: { id: true },
    });
    if (!event) {
      res.status(404).json({ error: "Event not found" });
      return;
    }

    const count = await prisma.eventGalleryImage.count({ where: { eventId } });
    if (count >= 12) {
      res.status(400).json({ error: "Gallery limit is 12 images" });
      return;
    }

    const image = await prisma.eventGalleryImage.create({
      data: {
        eventId,
        url: parsed.data.url,
        sortOrder: parsed.data.sortOrder ?? count,
      },
    });

    await writeAuditLog({
      actorId: req.auth!.sub,
      action: "event.gallery_add",
      entityType: "EventGalleryImage",
      entityId: image.id,
      metadata: { eventId },
    });

    const body: EventGalleryResponse = {
      images: [
        {
          id: image.id,
          url: image.url,
          sortOrder: image.sortOrder,
          createdAt: image.createdAt.toISOString(),
        },
      ],
    };
    res.status(201).json(body);
  },
);

/**
 * DELETE /organizer/events/:eventId/gallery/:imageId
 */
organizerOpsRouter.delete(
  "/organizer/events/:eventId/gallery/:imageId",
  async (req, res) => {
    const organizerId = req.auth!.organizerId!;
    const eventId = String(req.params.eventId);
    const imageId = String(req.params.imageId);

    const event = await prisma.event.findFirst({
      where: { id: eventId, organizerId },
      select: { id: true },
    });
    if (!event) {
      res.status(404).json({ error: "Event not found" });
      return;
    }

    const deleted = await prisma.eventGalleryImage.deleteMany({
      where: { id: imageId, eventId },
    });
    if (deleted.count === 0) {
      res.status(404).json({ error: "Image not found" });
      return;
    }

    await writeAuditLog({
      actorId: req.auth!.sub,
      action: "event.gallery_remove",
      entityType: "EventGalleryImage",
      entityId: imageId,
      metadata: { eventId },
    });

    res.status(204).send();
  },
);
