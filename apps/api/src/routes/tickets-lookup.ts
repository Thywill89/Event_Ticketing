import { Router } from "express";
import { z } from "zod";
import type { TicketLookupResponse } from "@event-ticketing/shared";
import { prisma } from "../db";

export const ticketsLookupRouter = Router();

const lookupSchema = z.object({
  email: z.string().email().max(255),
  ticketNumber: z.string().trim().min(4).max(64),
});

/**
 * POST /tickets/lookup
 * Guest ticket recovery when confirmation email is lost (plan §16).
 * Requires purchaser email + ticket number; returns QR token + order access.
 */
ticketsLookupRouter.post("/tickets/lookup", async (req, res) => {
  const parsed = lookupSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request", details: parsed.error.flatten() });
    return;
  }

  const email = parsed.data.email.toLowerCase();
  const ticketNumber = parsed.data.ticketNumber.toUpperCase();

  const ticket = await prisma.ticket.findFirst({
    where: {
      ticketNumber: { equals: ticketNumber, mode: "insensitive" },
      order: { purchaserEmail: { equals: email, mode: "insensitive" } },
      status: { in: ["ISSUED", "CHECKED_IN", "PAID"] },
    },
    include: {
      ticketType: { select: { name: true } },
      event: {
        select: {
          name: true,
          slug: true,
          startsAt: true,
          venue: { select: { name: true } },
        },
      },
      order: { select: { id: true, accessToken: true } },
    },
  });

  if (!ticket) {
    res.status(404).json({ error: "No matching ticket found" });
    return;
  }

  const body: TicketLookupResponse = {
    ticket: {
      ticketNumber: ticket.ticketNumber,
      status: ticket.status,
      ticketTypeName: ticket.ticketType.name,
      eventName: ticket.event.name,
      eventSlug: ticket.event.slug,
      startsAt: ticket.event.startsAt.toISOString(),
      venueName: ticket.event.venue?.name ?? null,
      qrToken: ticket.qrToken,
      orderId: ticket.order.id,
      accessToken: ticket.order.accessToken,
    },
  };
  res.json(body);
});
