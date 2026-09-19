import type {
  EventDto,
  TicketTypeDto,
  VenueDto,
} from "@event-ticketing/shared";
import type { Event, TicketType, Venue, Prisma } from "../../prisma/generated";

type EventWithRelations = Event & {
  venue: Venue | null;
  ticketTypes?: TicketType[];
};

export function toVenueDto(venue: Venue): VenueDto {
  return {
    id: venue.id,
    name: venue.name,
    address: venue.address,
    city: venue.city,
    area: venue.area,
    country: venue.country,
    mapUrl: venue.mapUrl,
  };
}

export function toTicketTypeDto(tt: TicketType): TicketTypeDto {
  return {
    id: tt.id,
    eventId: tt.eventId,
    name: tt.name,
    description: tt.description,
    price: tt.price.toFixed(2),
    currency: tt.currency,
    quantityTotal: tt.quantityTotal,
    quantityReserved: tt.quantityReserved,
    quantitySold: tt.quantitySold,
    salesStartsAt: tt.salesStartsAt?.toISOString() ?? null,
    salesEndsAt: tt.salesEndsAt?.toISOString() ?? null,
    isActive: tt.isActive,
    sortOrder: tt.sortOrder,
    createdAt: tt.createdAt.toISOString(),
    updatedAt: tt.updatedAt.toISOString(),
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

export function toEventDto(
  event: EventWithRelations,
  options?: { includeTicketTypes?: boolean },
): EventDto {
  const includeTicketTypes = options?.includeTicketTypes ?? Boolean(event.ticketTypes);
  return {
    id: event.id,
    slug: event.slug,
    name: event.name,
    status: event.status,
    startsAt: event.startsAt.toISOString(),
    endsAt: event.endsAt.toISOString(),
    organizerId: event.organizerId,
    category: event.category,
    description: event.description,
    mainImageUrl: event.mainImageUrl,
    dressCode: event.dressCode,
    ageRestriction: event.ageRestriction,
    rules: event.rules,
    notices: event.notices,
    contactDetails: event.contactDetails,
    socialLinks: parseSocialLinks(event.socialLinks),
    venueId: event.venueId,
    venue: event.venue ? toVenueDto(event.venue) : null,
    ticketTypes: includeTicketTypes
      ? (event.ticketTypes ?? [])
          .slice()
          .sort((a, b) => a.sortOrder - b.sortOrder || a.createdAt.getTime() - b.createdAt.getTime())
          .map(toTicketTypeDto)
      : undefined,
    createdAt: event.createdAt.toISOString(),
    updatedAt: event.updatedAt.toISOString(),
  };
}
