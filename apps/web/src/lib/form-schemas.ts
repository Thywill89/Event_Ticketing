import { z } from "zod";
import {
  createEventSchema,
  createTicketTypeSchema,
  updateEventSchema,
  type CreateEventRequest,
  type CreateTicketTypeRequest,
  type UpdateEventRequest,
  type VenueInputDto,
} from "@event-me/shared";

/** Text inputs always yield a string; treat a blank one as "not provided". */
export function blankAsUndefined<T extends z.ZodType<unknown, string | undefined>>(
  schema: T,
) {
  return z
    .string()
    .transform((value) => (value.trim() === "" ? undefined : value))
    .pipe(schema);
}

function blankToNull(value: string): string | null {
  return value.trim() === "" ? null : value;
}

/**
 * Local date/time input value → ISO string. Unparseable input is passed through
 * unchanged so the shared schema reports it as an invalid date.
 */
export function localDateTimeToIso(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toISOString();
}

function wholeNumber(value: string): number {
  return value.trim() === "" ? Number.NaN : Number(value);
}

// ---------------------------------------------------------------------------
// Venue
// ---------------------------------------------------------------------------

const venueFormFields = z.object({
  name: z.string(),
  address: z.string(),
  city: z.string(),
});
export type VenueFormValues = z.infer<typeof venueFormFields>;

export const emptyVenueForm: VenueFormValues = { name: "", address: "", city: "" };

/** All-blank venue → null; anything filled in is validated as a full venue. */
function venueFromForm(venue: VenueFormValues): VenueInputDto | null {
  if (!venue.name.trim() && !venue.address.trim() && !venue.city.trim()) {
    return null;
  }
  return { name: venue.name, address: venue.address, city: blankToNull(venue.city) };
}

// ---------------------------------------------------------------------------
// Ticket types
// ---------------------------------------------------------------------------

const ticketRowFields = z.object({
  name: z.string(),
  price: z.string(),
  quantityTotal: z.string(),
});
export type TicketRowFormValues = z.infer<typeof ticketRowFields>;

function ticketFromRow(row: TicketRowFormValues): CreateTicketTypeRequest {
  return {
    name: row.name,
    price: row.price,
    quantityTotal: wholeNumber(row.quantityTotal),
  };
}

/** Full ticket-type dialog (create and edit). */
export const ticketTypeFormSchema = ticketRowFields
  .extend({
    description: z.string(),
    salesStartsAt: z.string(),
    salesEndsAt: z.string(),
    isActive: z.boolean(),
  })
  .transform(
    (form): CreateTicketTypeRequest => ({
      ...ticketFromRow(form),
      description: blankToNull(form.description),
      salesStartsAt: form.salesStartsAt ? localDateTimeToIso(form.salesStartsAt) : null,
      salesEndsAt: form.salesEndsAt ? localDateTimeToIso(form.salesEndsAt) : null,
      isActive: form.isActive,
    }),
  )
  .pipe(createTicketTypeSchema);

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

type NewEventRequests = {
  event: CreateEventRequest;
  tickets: CreateTicketTypeRequest[];
};

/**
 * Create-event composer: event details, date/time pickers, and initial ticket
 * rows. Field names mirror the request so schema errors land on the right input.
 */
export const newEventFormSchema = z
  .object({
    event: z.object({
      name: z.string(),
      description: z.string(),
      venue: venueFormFields,
    }),
    schedule: z.object({
      startDate: z.string(),
      startTime: z.string(),
      endDate: z.string(),
      endTime: z.string(),
    }),
    tickets: z.array(ticketRowFields),
  })
  .transform(({ event, schedule, tickets }): NewEventRequests => ({
    event: {
      name: event.name,
      description: blankToNull(event.description),
      startsAt: localDateTimeToIso(`${schedule.startDate}T${schedule.startTime}:00`),
      endsAt: localDateTimeToIso(`${schedule.endDate}T${schedule.endTime}:00`),
      venue: venueFromForm(event.venue),
    },
    tickets: tickets.map(ticketFromRow),
  }))
  .pipe(
    z.object({
      event: createEventSchema,
      tickets: z.array(createTicketTypeSchema).min(1, "Add at least one ticket type"),
    }),
  );

export const editEventFormSchema = z
  .object({
    name: z.string(),
    description: z.string(),
    startsAt: z.string(),
    endsAt: z.string(),
    venue: venueFormFields,
  })
  .transform((form): UpdateEventRequest => ({
    name: form.name,
    description: blankToNull(form.description),
    startsAt: localDateTimeToIso(form.startsAt),
    endsAt: localDateTimeToIso(form.endsAt),
    venue: venueFromForm(form.venue),
  }))
  .pipe(updateEventSchema);
