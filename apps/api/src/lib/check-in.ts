import { Prisma } from "../../prisma/generated";
import type {
  CheckInErrorCode,
  CheckInFailureDto,
  CheckInListItemDto,
  CheckInRecordDto,
  CheckInStatsDto,
  CheckInSuccessDto,
  CheckInTicketSummaryDto,
  EventStatus,
  TicketStatus,
} from "@event-ticketing/shared";
import { CHECK_IN_ALLOWED_EVENT_STATUSES } from "@event-ticketing/shared";
import { prisma } from "../db";
import { writeAuditLog } from "./audit";

export class CheckInError extends Error {
  status: number;
  code: CheckInErrorCode;
  eventName?: string;
  ticket?: CheckInTicketSummaryDto;

  constructor(
    message: string,
    status: number,
    code: CheckInErrorCode,
    extras?: { eventName?: string; ticket?: CheckInTicketSummaryDto },
  ) {
    super(message);
    this.name = "CheckInError";
    this.status = status;
    this.code = code;
    this.eventName = extras?.eventName;
    this.ticket = extras?.ticket;
  }

  toFailureDto(): CheckInFailureDto {
    return {
      ok: false,
      code: this.code,
      message: this.message,
      ...(this.eventName ? { eventName: this.eventName } : {}),
      ...(this.ticket ? { ticket: this.ticket } : {}),
    };
  }
}

const ticketLookupInclude = {
  ticketType: { select: { id: true, name: true } },
  checkIn: true,
  event: { select: { id: true, name: true, status: true } },
} satisfies Prisma.TicketInclude;

type TicketLookupRow = Prisma.TicketGetPayload<{
  include: typeof ticketLookupInclude;
}>;

function allowsEntry(status: EventStatus): boolean {
  return (CHECK_IN_ALLOWED_EVENT_STATUSES as readonly string[]).includes(status);
}

function toTicketSummary(
  ticket: TicketLookupRow,
  checkedInAt?: Date | null,
): CheckInTicketSummaryDto {
  return {
    id: ticket.id,
    ticketNumber: ticket.ticketNumber,
    status: ticket.status as TicketStatus,
    ticketTypeName: ticket.ticketType.name,
    attendeeName: ticket.attendeeName,
    attendeeEmail: ticket.attendeeEmail,
    checkedInAt:
      checkedInAt?.toISOString() ??
      ticket.checkIn?.checkedInAt.toISOString() ??
      null,
  };
}

function toCheckInRecord(row: {
  id: string;
  ticketId: string;
  eventId: string;
  checkedInAt: Date;
  deviceLabel: string | null;
  checkedInBy: string | null;
}): CheckInRecordDto {
  return {
    id: row.id,
    ticketId: row.ticketId,
    eventId: row.eventId,
    checkedInAt: row.checkedInAt.toISOString(),
    deviceLabel: row.deviceLabel,
    checkedInBy: row.checkedInBy,
  };
}

/**
 * Resolve a pasted/scanned code to a ticket.
 * QR token is primary; ticket number is the human-readable backup (plan §9.5).
 */
async function findTicketByCode(code: string): Promise<TicketLookupRow | null> {
  const trimmed = code.trim();
  if (!trimmed) return null;

  const byToken = await prisma.ticket.findUnique({
    where: { qrToken: trimmed },
    include: ticketLookupInclude,
  });
  if (byToken) return byToken;

  const byNumber = await prisma.ticket.findFirst({
    where: {
      ticketNumber: { equals: trimmed, mode: "insensitive" },
    },
    include: ticketLookupInclude,
  });
  return byNumber;
}

function assertTicketReadyForCheckIn(
  ticket: TicketLookupRow,
  eventId: string,
): void {
  if (ticket.eventId !== eventId) {
    throw new CheckInError(
      "Ticket does not belong to this event",
      409,
      "WRONG_EVENT",
      {
        eventName: ticket.event.name,
        ticket: toTicketSummary(ticket),
      },
    );
  }

  if (!allowsEntry(ticket.event.status as EventStatus)) {
    throw new CheckInError(
      `Event is not accepting entry (status: ${ticket.event.status})`,
      409,
      "EVENT_ENTRY_CLOSED",
      {
        eventName: ticket.event.name,
        ticket: toTicketSummary(ticket),
      },
    );
  }

  if (ticket.status === "CHECKED_IN" || ticket.checkIn) {
    throw new CheckInError(
      "Ticket already checked in — entry denied",
      409,
      "TICKET_ALREADY_CHECKED_IN",
      {
        eventName: ticket.event.name,
        ticket: toTicketSummary(ticket),
      },
    );
  }

  if (ticket.status === "CANCELLED") {
    throw new CheckInError("Ticket is cancelled", 409, "TICKET_CANCELLED", {
      eventName: ticket.event.name,
      ticket: toTicketSummary(ticket),
    });
  }

  if (ticket.status === "REFUNDED") {
    throw new CheckInError("Ticket was refunded", 409, "TICKET_REFUNDED", {
      eventName: ticket.event.name,
      ticket: toTicketSummary(ticket),
    });
  }

  if (ticket.status === "VOID" || ticket.status === "EXPIRED") {
    throw new CheckInError(
      `Ticket cannot be used (status: ${ticket.status})`,
      409,
      "TICKET_INVALID_STATUS",
      {
        eventName: ticket.event.name,
        ticket: toTicketSummary(ticket),
      },
    );
  }

  // ISSUED is the post-payment credential state. PAID is transitional / unused
  // in the stub flow but accepted if present.
  if (ticket.status !== "ISSUED" && ticket.status !== "PAID") {
    throw new CheckInError(
      "Ticket is not paid/issued — entry denied",
      409,
      "TICKET_NOT_ISSUED",
      {
        eventName: ticket.event.name,
        ticket: toTicketSummary(ticket),
      },
    );
  }
}

export async function performCheckIn(input: {
  eventId: string;
  code: string;
  checkedInBy: string;
  deviceLabel?: string | null;
}): Promise<CheckInSuccessDto> {
  const event = await prisma.event.findUnique({
    where: { id: input.eventId },
    select: { id: true, name: true, status: true },
  });
  if (!event) {
    throw new CheckInError("Event not found", 404, "EVENT_NOT_FOUND");
  }
  if (!allowsEntry(event.status as EventStatus)) {
    throw new CheckInError(
      `Event is not accepting entry (status: ${event.status})`,
      409,
      "EVENT_ENTRY_CLOSED",
      { eventName: event.name },
    );
  }

  const ticket = await findTicketByCode(input.code);
  if (!ticket) {
    throw new CheckInError(
      "No ticket found for that QR token or ticket number",
      404,
      "TICKET_NOT_FOUND",
      { eventName: event.name },
    );
  }

  assertTicketReadyForCheckIn(ticket, input.eventId);

  const deviceLabel = input.deviceLabel?.trim() || null;

  try {
    const result = await prisma.$transaction(async (tx) => {
      // Atomic claim: only one concurrent scanner wins (plan §9.8 / §14).
      const claimed = await tx.ticket.updateMany({
        where: {
          id: ticket.id,
          eventId: input.eventId,
          status: { in: ["ISSUED", "PAID"] },
        },
        data: { status: "CHECKED_IN" },
      });

      if (claimed.count !== 1) {
        const latest = await tx.ticket.findUnique({
          where: { id: ticket.id },
          include: ticketLookupInclude,
        });
        if (latest?.status === "CHECKED_IN" || latest?.checkIn) {
          throw new CheckInError(
            "Ticket already checked in — entry denied",
            409,
            "TICKET_ALREADY_CHECKED_IN",
            {
              eventName: event.name,
              ticket: latest ? toTicketSummary(latest) : undefined,
            },
          );
        }
        throw new CheckInError(
          "Ticket could not be checked in",
          409,
          "TICKET_INVALID_STATUS",
          {
            eventName: event.name,
            ticket: latest ? toTicketSummary(latest) : undefined,
          },
        );
      }

      const checkIn = await tx.checkIn.create({
        data: {
          ticketId: ticket.id,
          eventId: input.eventId,
          checkedInBy: input.checkedInBy,
          deviceLabel,
        },
      });

      await writeAuditLog(
        {
          actorId: input.checkedInBy,
          action: "ticket.check_in",
          entityType: "Ticket",
          entityId: ticket.id,
          metadata: {
            eventId: input.eventId,
            checkInId: checkIn.id,
            ticketNumber: ticket.ticketNumber,
            deviceLabel,
          },
        },
        tx,
      );

      return checkIn;
    });

    return {
      ok: true,
      message: "Entry approved",
      eventName: event.name,
      ticket: toTicketSummary(
        { ...ticket, status: "CHECKED_IN" },
        result.checkedInAt,
      ),
      checkIn: toCheckInRecord(result),
    };
  } catch (err) {
    if (err instanceof CheckInError) throw err;
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002"
    ) {
      throw new CheckInError(
        "Ticket already checked in — entry denied",
        409,
        "TICKET_ALREADY_CHECKED_IN",
        {
          eventName: event.name,
          ticket: toTicketSummary(ticket),
        },
      );
    }
    throw err;
  }
}

export async function getCheckInStats(
  eventId: string,
): Promise<CheckInStatsDto> {
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    select: { id: true, name: true, status: true },
  });
  if (!event) {
    throw new CheckInError("Event not found", 404, "EVENT_NOT_FOUND");
  }

  const [ticketsSold, checkedIn] = await Promise.all([
    prisma.ticket.count({
      where: {
        eventId,
        status: { in: ["ISSUED", "PAID", "CHECKED_IN"] },
      },
    }),
    prisma.checkIn.count({ where: { eventId } }),
  ]);

  return {
    eventId: event.id,
    eventName: event.name,
    eventStatus: event.status as EventStatus,
    ticketsSold,
    checkedIn,
    notCheckedIn: Math.max(0, ticketsSold - checkedIn),
  };
}

export async function listCheckIns(
  eventId: string,
  options?: { limit?: number },
): Promise<CheckInListItemDto[]> {
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    select: { id: true },
  });
  if (!event) {
    throw new CheckInError("Event not found", 404, "EVENT_NOT_FOUND");
  }

  const limit = Math.min(Math.max(options?.limit ?? 50, 1), 200);

  const rows = await prisma.checkIn.findMany({
    where: { eventId },
    orderBy: { checkedInAt: "desc" },
    take: limit,
    include: {
      ticket: {
        select: {
          ticketNumber: true,
          attendeeName: true,
          ticketType: { select: { name: true } },
        },
      },
      staff: { select: { fullName: true } },
    },
  });

  return rows.map((row) => ({
    id: row.id,
    checkedInAt: row.checkedInAt.toISOString(),
    deviceLabel: row.deviceLabel,
    ticketNumber: row.ticket.ticketNumber,
    ticketTypeName: row.ticket.ticketType.name,
    attendeeName: row.ticket.attendeeName,
    checkedInByName: row.staff?.fullName ?? null,
  }));
}
