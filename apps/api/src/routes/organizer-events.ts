import { Router } from "express";
import {
  createEventSchema,
  createTicketTypeSchema,
  isEventDeletable,
  updateEventSchema,
  updateTicketTypeSchema,
  type OrganizerEventListResponse,
  type OrganizerEventResponse,
  type OrganizerTicketTypeResponse,
} from "@event-me/shared";
import { Prisma } from "../../prisma/generated";
import { prisma } from "../db";
import { writeAuditLog } from "../lib/audit";
import { toEventDto, toTicketTypeDto } from "../lib/event-mappers";
import { slugify } from "../lib/slug";
import { deleteEventImages } from "../lib/uploads";
import { requireOrganizer } from "../middleware/auth";

const eventInclude = {
  venue: true,
  ticketTypes: { orderBy: [{ sortOrder: "asc" as const }, { createdAt: "asc" as const }] },
};

async function uniqueEventSlug(
  baseName: string,
  options?: { excludeEventId?: string },
): Promise<string> {
  const base = slugify(baseName);
  for (let i = 0; i < 20; i++) {
    const candidate = i === 0 ? base : `${base}-${i + 1}`;
    const existing = await prisma.event.findUnique({
      where: { slug: candidate },
      select: { id: true },
    });
    if (!existing || existing.id === options?.excludeEventId) return candidate;
  }
  return `${base}-${Date.now().toString(36)}`;
}

async function findOwnedEvent(eventId: string, organizerId: string) {
  return prisma.event.findFirst({
    where: { id: eventId, organizerId },
    include: eventInclude,
  });
}

function nullableString(value: string | null | undefined): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

export const organizerEventsRouter = Router();

organizerEventsRouter.use("/organizer", requireOrganizer);

/**
 * GET /organizer/events — list events owned by the authenticated organizer.
 */
organizerEventsRouter.get("/organizer/events", async (req, res) => {
  const organizerId = req.auth!.organizerId!;

  const events = await prisma.event.findMany({
    where: { organizerId },
    include: eventInclude,
    orderBy: [{ startsAt: "desc" }, { createdAt: "desc" }],
  });

  const body: OrganizerEventListResponse = {
    events: events.map((event) => toEventDto(event, { includeTicketTypes: true })),
  };
  res.json(body);
});

/**
 * POST /organizer/events — create a DRAFT event (optional nested venue).
 */
organizerEventsRouter.post("/organizer/events", async (req, res) => {
  const parsed = createEventSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request", details: parsed.error.flatten() });
    return;
  }

  const organizerId = req.auth!.organizerId!;
  const data = parsed.data;
  const slug = await uniqueEventSlug(data.name);

  const created = await prisma.$transaction(async (tx) => {
    let venueId: string | null = null;
    if (data.venue) {
      const venue = await tx.venue.create({
        data: {
          name: data.venue.name,
          address: data.venue.address,
          city: nullableString(data.venue.city) ?? null,
          area: nullableString(data.venue.area) ?? null,
          country: nullableString(data.venue.country) ?? null,
          mapUrl: nullableString(data.venue.mapUrl) ?? null,
        },
      });
      venueId = venue.id;
    }

    return tx.event.create({
      data: {
        organizerId,
        venueId,
        name: data.name,
        slug,
        category: nullableString(data.category) ?? null,
        description: nullableString(data.description) ?? null,
        mainImageUrl: nullableString(data.mainImageUrl) ?? null,
        status: "DRAFT",
        startsAt: new Date(data.startsAt),
        endsAt: new Date(data.endsAt),
        dressCode: nullableString(data.dressCode) ?? null,
        ageRestriction: nullableString(data.ageRestriction) ?? null,
        rules: nullableString(data.rules) ?? null,
        notices: nullableString(data.notices) ?? null,
        contactDetails: nullableString(data.contactDetails) ?? null,
        socialLinks:
          data.socialLinks === undefined
            ? undefined
            : data.socialLinks === null
              ? Prisma.DbNull
              : data.socialLinks,
      },
      include: eventInclude,
    });
  });

  const body: OrganizerEventResponse = {
    event: toEventDto(created, { includeTicketTypes: true }),
  };
  res.status(201).json(body);
});

/**
 * GET /organizer/events/:eventId — get one owned event (with ticket types).
 */
organizerEventsRouter.get("/organizer/events/:eventId", async (req, res) => {
  const organizerId = req.auth!.organizerId!;
  const event = await findOwnedEvent(req.params.eventId, organizerId);
  if (!event) {
    res.status(404).json({ error: "Event not found" });
    return;
  }

  const body: OrganizerEventResponse = {
    event: toEventDto(event, { includeTicketTypes: true }),
  };
  res.json(body);
});

/**
 * DELETE /organizer/events/:eventId — permanently remove an owned event and
 * everything attached to it: check-ins, tickets, orders (items + payments),
 * ticket types, gallery, staff assignments, related notifications, an
 * otherwise-unused venue, and its stored images.
 * Only allowed while the event is not published / selling / live.
 */
organizerEventsRouter.delete("/organizer/events/:eventId", async (req, res) => {
  const organizerId = req.auth!.organizerId!;
  const eventId = String(req.params.eventId);

  const existing = await prisma.event.findFirst({
    where: { id: eventId, organizerId },
    select: {
      id: true,
      name: true,
      slug: true,
      status: true,
      venueId: true,
      _count: { select: { orders: true, tickets: true, checkIns: true } },
    },
  });
  if (!existing) {
    res.status(404).json({ error: "Event not found" });
    return;
  }

  if (!isEventDeletable(existing.status)) {
    res.status(409).json({
      error: "Cancel this event before deleting it",
      status: existing.status,
      code: "EVENT_NOT_DELETABLE",
    });
    return;
  }

  await prisma.$transaction(async (tx) => {
    const [orders, tickets] = await Promise.all([
      tx.order.findMany({ where: { eventId: existing.id }, select: { id: true } }),
      tx.ticket.findMany({ where: { eventId: existing.id }, select: { id: true } }),
    ]);

    await tx.notification.deleteMany({
      where: {
        OR: [
          { entityType: "Event", entityId: existing.id },
          { entityType: "Order", entityId: { in: orders.map((o) => o.id) } },
          { entityType: "Ticket", entityId: { in: tickets.map((t) => t.id) } },
        ],
      },
    });
    await tx.checkIn.deleteMany({ where: { eventId: existing.id } });
    await tx.ticket.deleteMany({ where: { eventId: existing.id } });
    await tx.order.deleteMany({ where: { eventId: existing.id } });
    await tx.event.delete({ where: { id: existing.id } });

    if (existing.venueId) {
      const stillUsed = await tx.event.count({ where: { venueId: existing.venueId } });
      if (stillUsed === 0) {
        await tx.venue.delete({ where: { id: existing.venueId } });
      }
    }

    await writeAuditLog(
      {
        actorId: req.auth!.sub,
        action: "event.delete",
        entityType: "Event",
        entityId: existing.id,
        metadata: {
          name: existing.name,
          slug: existing.slug,
          organizerId,
          status: existing.status,
          orders: existing._count.orders,
          tickets: existing._count.tickets,
          checkIns: existing._count.checkIns,
          by: "organizer",
        },
      },
      tx,
    );
  });

  try {
    await deleteEventImages(existing.id);
  } catch (err) {
    console.error(`Failed to remove stored images for deleted event ${existing.id}`, err);
  }

  res.status(204).send();
});

/**
 * PATCH /organizer/events/:eventId — update owned event (draft-focused content edits).
 * Status transitions (submit/publish) are deferred; status is not writable here.
 */
organizerEventsRouter.patch("/organizer/events/:eventId", async (req, res) => {
  const parsed = updateEventSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request", details: parsed.error.flatten() });
    return;
  }

  const organizerId = req.auth!.organizerId!;
  const existing = await prisma.event.findFirst({
    where: { id: req.params.eventId, organizerId },
    include: { venue: true },
  });
  if (!existing) {
    res.status(404).json({ error: "Event not found" });
    return;
  }

  // Draft-focused: only DRAFT events may be fully edited in this milestone.
  if (existing.status !== "DRAFT") {
    res.status(409).json({
      error: "Only DRAFT events can be edited in this milestone",
      status: existing.status,
    });
    return;
  }

  const data = parsed.data;
  const nextStartsAt = data.startsAt ? new Date(data.startsAt) : existing.startsAt;
  const nextEndsAt = data.endsAt ? new Date(data.endsAt) : existing.endsAt;
  if (nextEndsAt <= nextStartsAt) {
    res.status(400).json({ error: "endsAt must be after startsAt" });
    return;
  }

  const updated = await prisma.$transaction(async (tx) => {
    let venueId = existing.venueId;

    if (data.venue === null) {
      venueId = null;
    } else if (data.venue) {
      if (existing.venueId) {
        await tx.venue.update({
          where: { id: existing.venueId },
          data: {
            name: data.venue.name,
            address: data.venue.address,
            city: nullableString(data.venue.city) ?? null,
            area: nullableString(data.venue.area) ?? null,
            country: nullableString(data.venue.country) ?? null,
            mapUrl: nullableString(data.venue.mapUrl) ?? null,
          },
        });
      } else {
        const venue = await tx.venue.create({
          data: {
            name: data.venue.name,
            address: data.venue.address,
            city: nullableString(data.venue.city) ?? null,
            area: nullableString(data.venue.area) ?? null,
            country: nullableString(data.venue.country) ?? null,
            mapUrl: nullableString(data.venue.mapUrl) ?? null,
          },
        });
        venueId = venue.id;
      }
    }

    let slug = existing.slug;
    if (data.name && data.name !== existing.name) {
      slug = await uniqueEventSlug(data.name, { excludeEventId: existing.id });
    }

    return tx.event.update({
      where: { id: existing.id },
      data: {
        name: data.name ?? undefined,
        slug: data.name && data.name !== existing.name ? slug : undefined,
        category:
          data.category === undefined ? undefined : (nullableString(data.category) ?? null),
        description:
          data.description === undefined
            ? undefined
            : (nullableString(data.description) ?? null),
        mainImageUrl:
          data.mainImageUrl === undefined
            ? undefined
            : (nullableString(data.mainImageUrl) ?? null),
        startsAt: data.startsAt ? nextStartsAt : undefined,
        endsAt: data.endsAt ? nextEndsAt : undefined,
        dressCode:
          data.dressCode === undefined ? undefined : (nullableString(data.dressCode) ?? null),
        ageRestriction:
          data.ageRestriction === undefined
            ? undefined
            : (nullableString(data.ageRestriction) ?? null),
        rules: data.rules === undefined ? undefined : (nullableString(data.rules) ?? null),
        notices:
          data.notices === undefined ? undefined : (nullableString(data.notices) ?? null),
        contactDetails:
          data.contactDetails === undefined
            ? undefined
            : (nullableString(data.contactDetails) ?? null),
        socialLinks:
          data.socialLinks === undefined
            ? undefined
            : data.socialLinks === null
              ? Prisma.DbNull
              : data.socialLinks,
        venueId: data.venue === undefined ? undefined : venueId,
      },
      include: eventInclude,
    });
  });

  const body: OrganizerEventResponse = {
    event: toEventDto(updated, { includeTicketTypes: true }),
  };
  res.json(body);
});

/**
 * POST /organizer/events/:eventId/ticket-types — add a ticket type to an owned event.
 */
organizerEventsRouter.post(
  "/organizer/events/:eventId/ticket-types",
  async (req, res) => {
    const parsed = createTicketTypeSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid request", details: parsed.error.flatten() });
      return;
    }

    const organizerId = req.auth!.organizerId!;
    const event = await prisma.event.findFirst({
      where: { id: req.params.eventId, organizerId },
      select: { id: true, status: true },
    });
    if (!event) {
      res.status(404).json({ error: "Event not found" });
      return;
    }
    if (event.status !== "DRAFT") {
      res.status(409).json({
        error: "Ticket types can only be managed on DRAFT events in this milestone",
        status: event.status,
      });
      return;
    }

    const data = parsed.data;
    const ticketType = await prisma.ticketType.create({
      data: {
        eventId: event.id,
        name: data.name,
        description: nullableString(data.description) ?? null,
        price: new Prisma.Decimal(data.price),
        currency: data.currency ?? "GHS",
        quantityTotal: data.quantityTotal,
        salesStartsAt: data.salesStartsAt ? new Date(data.salesStartsAt) : null,
        salesEndsAt: data.salesEndsAt ? new Date(data.salesEndsAt) : null,
        isActive: data.isActive ?? true,
        sortOrder: data.sortOrder ?? 0,
      },
    });

    const body: OrganizerTicketTypeResponse = { ticketType: toTicketTypeDto(ticketType) };
    res.status(201).json(body);
  },
);

/**
 * PATCH /organizer/events/:eventId/ticket-types/:ticketTypeId — update owned ticket type.
 */
organizerEventsRouter.patch(
  "/organizer/events/:eventId/ticket-types/:ticketTypeId",
  async (req, res) => {
    const parsed = updateTicketTypeSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid request", details: parsed.error.flatten() });
      return;
    }

    const organizerId = req.auth!.organizerId!;
    const event = await prisma.event.findFirst({
      where: { id: req.params.eventId, organizerId },
      select: { id: true, status: true },
    });
    if (!event) {
      res.status(404).json({ error: "Event not found" });
      return;
    }
    if (event.status !== "DRAFT") {
      res.status(409).json({
        error: "Ticket types can only be managed on DRAFT events in this milestone",
        status: event.status,
      });
      return;
    }

    const existing = await prisma.ticketType.findFirst({
      where: { id: req.params.ticketTypeId, eventId: event.id },
    });
    if (!existing) {
      res.status(404).json({ error: "Ticket type not found" });
      return;
    }

    const data = parsed.data;
    if (data.quantityTotal !== undefined) {
      const committed = existing.quantityReserved + existing.quantitySold;
      if (data.quantityTotal < committed) {
        res.status(400).json({
          error: `quantityTotal cannot be below reserved+sold (${committed})`,
        });
        return;
      }
    }

    const nextSalesStart =
      data.salesStartsAt === undefined
        ? existing.salesStartsAt
        : data.salesStartsAt
          ? new Date(data.salesStartsAt)
          : null;
    const nextSalesEnd =
      data.salesEndsAt === undefined
        ? existing.salesEndsAt
        : data.salesEndsAt
          ? new Date(data.salesEndsAt)
          : null;
    if (nextSalesStart && nextSalesEnd && nextSalesEnd <= nextSalesStart) {
      res.status(400).json({ error: "salesEndsAt must be after salesStartsAt" });
      return;
    }

    const ticketType = await prisma.ticketType.update({
      where: { id: existing.id },
      data: {
        name: data.name,
        description:
          data.description === undefined
            ? undefined
            : (nullableString(data.description) ?? null),
        price: data.price === undefined ? undefined : new Prisma.Decimal(data.price),
        currency: data.currency,
        quantityTotal: data.quantityTotal,
        salesStartsAt:
          data.salesStartsAt === undefined ? undefined : nextSalesStart,
        salesEndsAt: data.salesEndsAt === undefined ? undefined : nextSalesEnd,
        isActive: data.isActive,
        sortOrder: data.sortOrder,
      },
    });

    const body: OrganizerTicketTypeResponse = { ticketType: toTicketTypeDto(ticketType) };
    res.json(body);
  },
);
