/**
 * Request body schemas shared by the API (server validation) and the web app
 * (form validation). Messages are user-facing: forms show them under fields.
 */
import { z } from "zod";

function requiredText(label: string, max: number) {
  return z
    .string()
    .trim()
    .min(1, `${label} is required`)
    .max(max, `${label} must be ${max} characters or fewer`);
}

function optionalText(label: string, max: number) {
  return z.string().trim().max(max, `${label} must be ${max} characters or fewer`);
}

function urlField(label: string) {
  return z
    .string()
    .trim()
    .pipe(z.url(`${label} must be a valid URL`))
    .pipe(z.string().max(2000, `${label} must be 2000 characters or fewer`));
}

function dateTimeField(label: string) {
  return z.iso.datetime({ offset: true, error: `${label} must be a valid date and time` });
}

const emailField = z
  .email("Enter a valid email address")
  .max(255, "Email must be 255 characters or fewer");

const newPasswordField = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .max(128, "Password must be 128 characters or fewer");

const phoneField = z
  .string()
  .trim()
  .min(5, "Enter a valid phone number")
  .max(40, "Phone must be 40 characters or fewer");

function endsAfterStarts(
  start: string | null | undefined,
  end: string | null | undefined,
): boolean {
  if (!start || !end) return true;
  const startMs = Date.parse(start);
  const endMs = Date.parse(end);
  if (Number.isNaN(startMs) || Number.isNaN(endMs)) return true;
  return endMs > startMs;
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

export const registerOrganizerSchema = z.object({
  email: emailField,
  password: newPasswordField,
  fullName: requiredText("Full name", 120),
  displayName: requiredText("Display name", 120),
  phone: phoneField.optional(),
});
export type RegisterOrganizerRequest = z.infer<typeof registerOrganizerSchema>;

export const loginSchema = z.object({
  email: emailField,
  password: z
    .string()
    .min(1, "Password is required")
    .max(128, "Password must be 128 characters or fewer"),
});
export type LoginRequest = z.infer<typeof loginSchema>;

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

export const venueInputSchema = z.object({
  name: requiredText("Venue name", 200),
  address: requiredText("Address", 500),
  city: requiredText("City", 120).nullable().optional(),
  area: requiredText("Area", 120).nullable().optional(),
  country: requiredText("Country", 120).nullable().optional(),
  mapUrl: urlField("Map URL").nullable().optional(),
});
/** Nested venue write payload (create or upsert on event). */
export type VenueInputDto = z.infer<typeof venueInputSchema>;

const socialLinksSchema = z
  .record(requiredText("Link label", 64), urlField("Social link"))
  .nullable()
  .optional();

const eventFields = {
  name: requiredText("Event name", 200),
  category: requiredText("Category", 80).nullable().optional(),
  description: optionalText("Description", 10_000).nullable().optional(),
  mainImageUrl: urlField("Image URL").nullable().optional(),
  startsAt: dateTimeField("Start"),
  endsAt: dateTimeField("End"),
  dressCode: optionalText("Dress code", 500).nullable().optional(),
  ageRestriction: optionalText("Age restriction", 200).nullable().optional(),
  rules: optionalText("Rules", 10_000).nullable().optional(),
  notices: optionalText("Notices", 10_000).nullable().optional(),
  contactDetails: optionalText("Contact details", 2000).nullable().optional(),
  socialLinks: socialLinksSchema,
  venue: venueInputSchema.nullable().optional(),
};

export const createEventSchema = z
  .object(eventFields)
  .refine((data) => endsAfterStarts(data.startsAt, data.endsAt), {
    path: ["endsAt"],
    message: "End must be after start",
  });
export type CreateEventRequest = z.infer<typeof createEventSchema>;

export const updateEventSchema = z
  .object(eventFields)
  .partial({ name: true, startsAt: true, endsAt: true })
  .refine((data) => endsAfterStarts(data.startsAt, data.endsAt), {
    path: ["endsAt"],
    message: "End must be after start",
  });
/** `venue: null` detaches the venue; omit to leave unchanged. */
export type UpdateEventRequest = z.infer<typeof updateEventSchema>;

export const rejectEventSchema = z.object({
  reason: requiredText("Reason", 2000).optional(),
});
export type RejectEventRequest = z.infer<typeof rejectEventSchema>;

export const addGalleryImageSchema = z.object({
  url: urlField("Image URL"),
  sortOrder: z.number().int().min(0).max(1000).optional(),
});
export type AddGalleryImageRequest = z.infer<typeof addGalleryImageSchema>;

// ---------------------------------------------------------------------------
// Ticket types
// ---------------------------------------------------------------------------

const PRICE_MESSAGE = "Enter a price like 50 or 49.99";

const moneySchema = z.union(
  [
    z.number().finite().nonnegative(PRICE_MESSAGE),
    z
      .string()
      .trim()
      .regex(/^\d+(\.\d{1,2})?$/, PRICE_MESSAGE),
  ],
  { error: PRICE_MESSAGE },
);

const ticketTypeFields = {
  name: requiredText("Ticket name", 120),
  description: optionalText("Description", 2000).nullable().optional(),
  price: moneySchema,
  currency: z
    .string()
    .trim()
    .regex(/^[A-Z]{3}$/, "Currency must be a 3-letter code like GHS")
    .optional(),
  quantityTotal: z
    .number({ error: "Enter a whole number" })
    .int("Enter a whole number")
    .min(0, "Quantity can't be negative")
    .max(1_000_000, "Quantity must be 1,000,000 or fewer"),
  salesStartsAt: dateTimeField("Sales start").nullable().optional(),
  salesEndsAt: dateTimeField("Sales end").nullable().optional(),
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().min(0).max(10_000).optional(),
};

export const createTicketTypeSchema = z
  .object(ticketTypeFields)
  .refine((data) => endsAfterStarts(data.salesStartsAt, data.salesEndsAt), {
    path: ["salesEndsAt"],
    message: "Sales end must be after sales start",
  });
export type CreateTicketTypeRequest = z.infer<typeof createTicketTypeSchema>;

export const updateTicketTypeSchema = z
  .object(ticketTypeFields)
  .partial()
  .refine((data) => endsAfterStarts(data.salesStartsAt, data.salesEndsAt), {
    path: ["salesEndsAt"],
    message: "Sales end must be after sales start",
  });
export type UpdateTicketTypeRequest = z.infer<typeof updateTicketTypeSchema>;

// ---------------------------------------------------------------------------
// Orders
// ---------------------------------------------------------------------------

export const createOrderItemSchema = z.object({
  ticketTypeId: z.string().min(1),
  quantity: z
    .number()
    .int()
    .min(1, "Quantity must be at least 1")
    .max(20, "You can buy at most 20 of each ticket"),
});
export type CreateOrderItemRequest = z.infer<typeof createOrderItemSchema>;

export const createOrderSchema = z.object({
  purchaserName: requiredText("Full name", 120),
  purchaserEmail: emailField,
  purchaserPhone: phoneField,
  items: z
    .array(createOrderItemSchema)
    .min(1, "Select at least one ticket")
    .max(20, "Too many ticket types in one order"),
});
export type CreateOrderRequest = z.infer<typeof createOrderSchema>;

// ---------------------------------------------------------------------------
// Check-in
// ---------------------------------------------------------------------------

export const performCheckInSchema = z.object({
  /** QR token (primary) or human-readable ticket number (backup). */
  code: requiredText("Code", 200),
  deviceLabel: requiredText("Device label", 80).optional(),
});
export type PerformCheckInRequest = z.infer<typeof performCheckInSchema>;

// ---------------------------------------------------------------------------
// Organizer staff
// ---------------------------------------------------------------------------

export const createOrganizerStaffSchema = z.object({
  email: emailField,
  password: newPasswordField,
  fullName: requiredText("Full name", 120),
  /** Optional: assign to this event immediately. */
  eventId: z.string().min(1).optional(),
});
export type CreateOrganizerStaffRequest = z.infer<typeof createOrganizerStaffSchema>;

export const updateOrganizerStaffSchema = z.object({
  isActive: z.boolean().optional(),
  fullName: requiredText("Full name", 120).optional(),
  password: newPasswordField.optional(),
});
export type UpdateOrganizerStaffRequest = z.infer<typeof updateOrganizerStaffSchema>;

export const assignEventStaffSchema = z.object({
  staffId: z.string().min(1, "Choose a staff member"),
});
export type AssignEventStaffRequest = z.infer<typeof assignEventStaffSchema>;
