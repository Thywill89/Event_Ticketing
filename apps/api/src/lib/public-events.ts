import type {
  PublicEventDto,
  PublicEventStatus,
  PublicTicketTypeDto,
} from "@event-ticketing/shared";
import { PUBLIC_EVENT_STATUSES } from "@event-ticketing/shared";
import type { Event, Organizer, Prisma, TicketType, Venue } from "../../prisma/generated";
import { toVenueDto } from "./event-mappers";

export const PUBLIC_STATUS_SET = new Set<string>(PUBLIC_EVENT_STATUSES);

export function isPublicEventStatus(status: string): status is PublicEventStatus {
  return PUBLIC_STATUS_SET.has(status);
}

export const publicEventInclude = {
  venue: true,
  ticketTypes: {
    where: { isActive: true },
    orderBy: [{ sortOrder: "asc" as const }, { createdAt: "asc" as const }],
  },
  organizer: { select: { displayName: true } },
} satisfies Prisma.EventInclude;

type PublicEventRow = Event & {
  venue: Venue | null;
  ticketTypes?: TicketType[];
  organizer: Pick<Organizer, "displayName">;
};

export function quantityAvailable(tt: TicketType): number {
  return Math.max(0, tt.quantityTotal - tt.quantityReserved - tt.quantitySold);
}

export function toPublicTicketTypeDto(tt: TicketType): PublicTicketTypeDto {
  return {
    id: tt.id,
    name: tt.name,
    description: tt.description,
    price: tt.price.toFixed(2),
    currency: tt.currency,
    quantityAvailable: quantityAvailable(tt),
    salesStartsAt: tt.salesStartsAt?.toISOString() ?? null,
    salesEndsAt: tt.salesEndsAt?.toISOString() ?? null,
    isActive: tt.isActive,
    sortOrder: tt.sortOrder,
  };
}

export function toPublicEventDto(
  event: PublicEventRow,
  options?: { includeTicketTypes?: boolean },
): PublicEventDto {
  const includeTicketTypes =
    options?.includeTicketTypes ?? Boolean(event.ticketTypes);

  if (!isPublicEventStatus(event.status)) {
    throw new Error(`Event ${event.id} is not publicly visible (${event.status})`);
  }

  return {
    id: event.id,
    slug: event.slug,
    name: event.name,
    status: event.status,
    startsAt: event.startsAt.toISOString(),
    endsAt: event.endsAt.toISOString(),
    category: event.category,
    description: event.description,
    mainImageUrl: event.mainImageUrl,
    dressCode: event.dressCode,
    ageRestriction: event.ageRestriction,
    rules: event.rules,
    notices: event.notices,
    contactDetails: event.contactDetails,
    socialLinks: parseSocialLinks(event.socialLinks),
    venue: event.venue ? toVenueDto(event.venue) : null,
    organizerDisplayName: event.organizer.displayName,
    ticketTypes: includeTicketTypes
      ? (event.ticketTypes ?? []).map(toPublicTicketTypeDto)
      : undefined,
  };
}

function parseSocialLinks(
  value: Prisma.JsonValue | null,
): Record<string, string> | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "object" || Array.isArray(value)) return null;
  const out: Record<string, string> = {};
  for (const [key, raw] of Object.entries(value)) {
    if (typeof raw === "string") out[key] = raw;
  }
  return Object.keys(out).length > 0 ? out : null;
}
