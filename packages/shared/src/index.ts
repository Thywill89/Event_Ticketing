/** Shared domain types for EventTicketing (aligned with Prisma schema). */

export type UserRole = "PLATFORM_ADMIN" | "ORGANIZER" | "CHECK_IN_STAFF";

export type OrganizerStatus = "PENDING" | "APPROVED" | "SUSPENDED";

export type EventStatus =
  | "DRAFT"
  | "PENDING_REVIEW"
  | "APPROVED"
  | "PUBLISHED"
  | "SALES_OPEN"
  | "SALES_PAUSED"
  | "SALES_CLOSED"
  | "LIVE"
  | "COMPLETED"
  | "CANCELLED"
  | "POSTPONED";

/** Ticket lifecycle (plan §8.4). */
export type TicketStatus =
  | "CREATED"
  | "RESERVED"
  | "PAID"
  | "ISSUED"
  | "CHECKED_IN"
  | "CANCELLED"
  | "REFUNDED"
  | "VOID"
  | "EXPIRED";

export type OrderStatus =
  | "PENDING"
  | "RESERVED"
  | "PAID"
  | "FAILED"
  | "CANCELLED"
  | "REFUNDED";

export type PaymentStatus =
  | "PENDING"
  | "SUCCEEDED"
  | "FAILED"
  | "REFUNDED";

export type NotificationChannel = "EMAIL" | "SMS" | "WHATSAPP";

export type NotificationStatus = "PENDING" | "SENT" | "FAILED";

export interface TicketDto {
  id: string;
  ticketNumber: string;
  eventId: string;
  orderId: string;
  ticketTypeId: string;
  status: TicketStatus;
  attendeeName?: string | null;
}

/** Legacy compact order summary (prefer OrderDetailDto for checkout). */
export interface OrderDto {
  id: string;
  eventId: string;
  status: OrderStatus;
  purchaserName: string;
  purchaserEmail: string;
  totalAmount: string;
  currency: string;
  ticketIds: string[];
}

export interface PaymentDto {
  id: string;
  orderId: string;
  status: PaymentStatus;
  amount: string;
  currency: string;
  provider: string | null;
  providerRef?: string | null;
  paidAt: string | null;
}

export interface CreateOrderItemRequest {
  ticketTypeId: string;
  quantity: number;
}

export interface CreateOrderRequest {
  purchaserName: string;
  purchaserEmail: string;
  purchaserPhone: string;
  items: CreateOrderItemRequest[];
}

export interface OrderItemDto {
  id: string;
  ticketTypeId: string;
  ticketTypeName: string;
  quantity: number;
  unitPrice: string;
  lineTotal: string;
}

/** Issued ticket as shown on guest confirmation (includes QR token). */
export interface IssuedTicketDto {
  id: string;
  ticketNumber: string;
  ticketTypeId: string;
  ticketTypeName: string;
  status: TicketStatus;
  qrToken: string;
  issuedAt: string | null;
}

export interface OrderDetailDto {
  id: string;
  eventId: string;
  eventName: string;
  eventSlug: string;
  status: OrderStatus;
  purchaserName: string;
  purchaserEmail: string;
  purchaserPhone: string;
  currency: string;
  subtotalAmount: string;
  totalAmount: string;
  reservedUntil: string | null;
  /** Required for guest GET / stub payment; store client-side after create. */
  accessToken: string;
  items: OrderItemDto[];
  payment: PaymentDto | null;
  tickets: IssuedTicketDto[];
  createdAt: string;
}

export interface CreateOrderResponse {
  order: OrderDetailDto;
}

export interface OrderResponse {
  order: OrderDetailDto;
}

export interface ExpireReservationsResponse {
  expiredCount: number;
}

/** Public payment UI config from GET /payments/config */
export interface PaymentConfigResponse {
  provider: "paystack" | "stub" | "none";
  stubAllowed: boolean;
  /** Paystack public key when provider is paystack (may be null if unset). */
  publicKey: string | null;
}

/** POST /orders/:orderId/payments/initialize */
export interface InitializePaymentResponse {
  order: OrderDetailDto;
  authorizationUrl: string;
  accessCode: string;
  reference: string;
  publicKey: string | null;
}

/** Authenticated account payload returned by auth endpoints (no password). */
export interface AuthOrganizerDto {
  id: string;
  displayName: string;
  status: OrganizerStatus;
}

export interface AuthUserDto {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
  organizer: AuthOrganizerDto | null;
}

export interface LoginResponse {
  /** Short-lived access JWT (Authorization: Bearer). */
  token: string;
  user: AuthUserDto;
}

export interface OrganizerRegisterResponse {
  token: string;
  user: AuthUserDto;
}

/** POST /auth/refresh — new access JWT; refresh cookie is rotated. */
export interface RefreshTokenResponse {
  token: string;
  user: AuthUserDto;
}

/** Venue embedded on organizer event payloads. */
export interface VenueDto {
  id: string;
  name: string;
  address: string;
  city: string | null;
  area: string | null;
  country: string | null;
  mapUrl: string | null;
}

export interface TicketTypeDto {
  id: string;
  eventId: string;
  name: string;
  description: string | null;
  /** Major currency units as decimal string (e.g. "50.00"). */
  price: string;
  currency: string;
  quantityTotal: number;
  quantityReserved: number;
  quantitySold: number;
  salesStartsAt: string | null;
  salesEndsAt: string | null;
  isActive: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface EventDto {
  id: string;
  slug: string;
  name: string;
  status: EventStatus;
  startsAt: string;
  endsAt: string;
  organizerId: string;
  category: string | null;
  description: string | null;
  mainImageUrl: string | null;
  dressCode: string | null;
  ageRestriction: string | null;
  rules: string | null;
  notices: string | null;
  contactDetails: string | null;
  socialLinks: Record<string, string> | null;
  venueId: string | null;
  venue: VenueDto | null;
  ticketTypes?: TicketTypeDto[];
  createdAt: string;
  updatedAt: string;
}

/** Nested venue write payload (create or upsert on event). */
export interface VenueInputDto {
  name: string;
  address: string;
  city?: string | null;
  area?: string | null;
  country?: string | null;
  mapUrl?: string | null;
}

export interface CreateEventRequest {
  name: string;
  category?: string | null;
  description?: string | null;
  mainImageUrl?: string | null;
  startsAt: string;
  endsAt: string;
  dressCode?: string | null;
  ageRestriction?: string | null;
  rules?: string | null;
  notices?: string | null;
  contactDetails?: string | null;
  socialLinks?: Record<string, string> | null;
  venue?: VenueInputDto | null;
}

export interface UpdateEventRequest {
  name?: string;
  category?: string | null;
  description?: string | null;
  mainImageUrl?: string | null;
  startsAt?: string;
  endsAt?: string;
  dressCode?: string | null;
  ageRestriction?: string | null;
  rules?: string | null;
  notices?: string | null;
  contactDetails?: string | null;
  socialLinks?: Record<string, string> | null;
  /** Set to null to detach venue; omit to leave unchanged. */
  venue?: VenueInputDto | null;
}

export interface CreateTicketTypeRequest {
  name: string;
  description?: string | null;
  price: number | string;
  currency?: string;
  quantityTotal: number;
  salesStartsAt?: string | null;
  salesEndsAt?: string | null;
  isActive?: boolean;
  sortOrder?: number;
}

export interface UpdateTicketTypeRequest {
  name?: string;
  description?: string | null;
  price?: number | string;
  currency?: string;
  quantityTotal?: number;
  salesStartsAt?: string | null;
  salesEndsAt?: string | null;
  isActive?: boolean;
  sortOrder?: number;
}

export interface OrganizerEventListResponse {
  events: EventDto[];
}

export interface OrganizerEventResponse {
  event: EventDto;
}

export interface OrganizerTicketTypeResponse {
  ticketType: TicketTypeDto;
}

/** Organizer summary attached to admin event review payloads. */
export interface AdminEventOrganizerDto {
  id: string;
  displayName: string;
  status: OrganizerStatus;
  email: string;
  fullName: string;
}

export interface AdminEventDto extends EventDto {
  organizer: AdminEventOrganizerDto;
}

export interface AdminEventListResponse {
  events: AdminEventDto[];
}

export interface AdminEventResponse {
  event: AdminEventDto;
}

export interface RejectEventRequest {
  reason?: string;
}

/**
 * Statuses visible on the public site (past publish).
 * DRAFT / PENDING_REVIEW / APPROVED are never exposed.
 */
export const PUBLIC_EVENT_STATUSES = [
  "PUBLISHED",
  "SALES_OPEN",
  "SALES_PAUSED",
  "SALES_CLOSED",
  "LIVE",
  "COMPLETED",
  "CANCELLED",
  "POSTPONED",
] as const satisfies readonly EventStatus[];

export type PublicEventStatus = (typeof PUBLIC_EVENT_STATUSES)[number];

/** Public ticket offering with availability summary (no reservation details). */
export interface PublicTicketTypeDto {
  id: string;
  name: string;
  description: string | null;
  /** Major currency units as decimal string (e.g. "50.00"). */
  price: string;
  currency: string;
  /** Remaining inventory: total − reserved − sold. */
  quantityAvailable: number;
  salesStartsAt: string | null;
  salesEndsAt: string | null;
  isActive: boolean;
  sortOrder: number;
}

/** Event gallery image (plan §5.3 / §6.2). */
export interface EventGalleryImageDto {
  id: string;
  url: string;
  sortOrder: number;
  createdAt: string;
}

export interface PublicEventDto {
  id: string;
  slug: string;
  name: string;
  status: PublicEventStatus;
  startsAt: string;
  endsAt: string;
  category: string | null;
  description: string | null;
  mainImageUrl: string | null;
  dressCode: string | null;
  ageRestriction: string | null;
  rules: string | null;
  notices: string | null;
  contactDetails: string | null;
  socialLinks: Record<string, string> | null;
  venue: VenueDto | null;
  organizerDisplayName: string;
  ticketTypes?: PublicTicketTypeDto[];
  galleryImages?: EventGalleryImageDto[];
}

export interface PublicEventListResponse {
  events: PublicEventDto[];
}

export interface PublicEventResponse {
  event: PublicEventDto;
}

/** Default soft-reservation window for unpaid orders (plan §7.4). */
export const DEFAULT_ORDER_RESERVATION_MINUTES = 15;

/**
 * Event statuses that allow door entry / check-in (plan §6.4 / §9.2).
 * LIVE is the primary door state; sales-open/closed statuses allow early doors
 * and local testing before a formal go-live transition.
 */
export const CHECK_IN_ALLOWED_EVENT_STATUSES = [
  "SALES_OPEN",
  "SALES_PAUSED",
  "SALES_CLOSED",
  "LIVE",
] as const satisfies readonly EventStatus[];

export type CheckInAllowedEventStatus =
  (typeof CHECK_IN_ALLOWED_EVENT_STATUSES)[number];

export type CheckInErrorCode =
  | "TICKET_NOT_FOUND"
  | "WRONG_EVENT"
  | "TICKET_NOT_ISSUED"
  | "TICKET_ALREADY_CHECKED_IN"
  | "TICKET_CANCELLED"
  | "TICKET_REFUNDED"
  | "TICKET_INVALID_STATUS"
  | "EVENT_ENTRY_CLOSED"
  | "EVENT_NOT_FOUND"
  | "FORBIDDEN";

export interface CheckInTicketSummaryDto {
  id: string;
  ticketNumber: string;
  status: TicketStatus;
  ticketTypeName: string;
  attendeeName: string | null;
  attendeeEmail: string | null;
  checkedInAt: string | null;
}

export interface CheckInRecordDto {
  id: string;
  ticketId: string;
  eventId: string;
  checkedInAt: string;
  deviceLabel: string | null;
  checkedInBy: string | null;
}

export interface CheckInSuccessDto {
  ok: true;
  message: string;
  eventName: string;
  ticket: CheckInTicketSummaryDto;
  checkIn: CheckInRecordDto;
}

export interface CheckInFailureDto {
  ok: false;
  code: CheckInErrorCode;
  message: string;
  eventName?: string;
  ticket?: CheckInTicketSummaryDto;
}

export type CheckInResponse = CheckInSuccessDto | CheckInFailureDto;

export interface PerformCheckInRequest {
  /** QR token (primary) or human-readable ticket number (backup). */
  code: string;
  deviceLabel?: string;
}

export interface CheckInStatsDto {
  eventId: string;
  eventName: string;
  eventStatus: EventStatus;
  ticketsSold: number;
  checkedIn: number;
  notCheckedIn: number;
}

export interface CheckInStatsResponse {
  stats: CheckInStatsDto;
}

export interface CheckInListItemDto {
  id: string;
  checkedInAt: string;
  deviceLabel: string | null;
  ticketNumber: string;
  ticketTypeName: string;
  attendeeName: string | null;
  checkedInByName: string | null;
}

export interface CheckInListResponse {
  checkIns: CheckInListItemDto[];
}

export interface StaffEventDto {
  id: string;
  name: string;
  slug: string;
  status: EventStatus;
  startsAt: string;
  endsAt: string;
  organizerDisplayName: string;
}

export interface StaffEventListResponse {
  events: StaffEventDto[];
}

/** Organizer door-staff member (plan §4.2 / §13.5 Staff). */
export interface OrganizerStaffDto {
  id: string;
  userId: string;
  email: string;
  fullName: string;
  isActive: boolean;
  assignedEventIds: string[];
  createdAt: string;
}

export interface OrganizerStaffListResponse {
  staff: OrganizerStaffDto[];
}

export interface OrganizerStaffResponse {
  staff: OrganizerStaffDto;
}

export interface CreateOrganizerStaffRequest {
  email: string;
  password: string;
  fullName: string;
  /** Optional: assign to this event immediately. */
  eventId?: string;
}

export interface UpdateOrganizerStaffRequest {
  isActive?: boolean;
  fullName?: string;
  password?: string;
}

export interface EventStaffAssignmentDto {
  staffId: string;
  email: string;
  fullName: string;
  isActive: boolean;
  assignedAt: string;
}

export interface EventStaffListResponse {
  staff: EventStaffAssignmentDto[];
}

export interface AssignEventStaffRequest {
  staffId: string;
}

export interface EventGalleryResponse {
  images: EventGalleryImageDto[];
}

export interface AddGalleryImageRequest {
  url: string;
  sortOrder?: number;
}

export interface OrganizerDashboardStatsDto {
  upcomingEvents: number;
  ticketsSold: number;
  checkedIn: number;
  remaining: number;
  /** Major currency units as decimal string. */
  revenue: string;
  currency: string;
}

export interface OrganizerDashboardResponse {
  stats: OrganizerDashboardStatsDto;
}

export interface OrganizerOrderSummaryDto {
  id: string;
  status: OrderStatus;
  purchaserName: string;
  purchaserEmail: string;
  purchaserPhone: string;
  totalAmount: string;
  currency: string;
  paymentStatus: PaymentStatus | null;
  ticketCount: number;
  createdAt: string;
}

export interface OrganizerOrderListResponse {
  orders: OrganizerOrderSummaryDto[];
}

export interface OrganizerAttendeeDto {
  ticketId: string;
  ticketNumber: string;
  ticketTypeName: string;
  status: TicketStatus;
  attendeeName: string | null;
  attendeeEmail: string | null;
  checkedInAt: string | null;
  orderId: string;
  purchasedAt: string;
}

export interface OrganizerAttendeeListResponse {
  attendees: OrganizerAttendeeDto[];
}

export interface AdminOrganizerDto {
  id: string;
  displayName: string;
  status: OrganizerStatus;
  email: string;
  fullName: string;
  phone: string | null;
  eventCount: number;
  createdAt: string;
}

export interface AdminOrganizerListResponse {
  organizers: AdminOrganizerDto[];
}

export interface AdminOrganizerResponse {
  organizer: AdminOrganizerDto;
}

export interface AdminOrderSummaryDto {
  id: string;
  eventId: string;
  eventName: string;
  status: OrderStatus;
  purchaserName: string;
  purchaserEmail: string;
  totalAmount: string;
  currency: string;
  paymentStatus: PaymentStatus | null;
  paymentProvider: string | null;
  createdAt: string;
}

export interface AdminOrderListResponse {
  orders: AdminOrderSummaryDto[];
}

export interface AdminPlatformStatsDto {
  organizersPending: number;
  organizersApproved: number;
  eventsPendingReview: number;
  eventsLive: number;
  ordersPaid: number;
  /** Major currency units as decimal string. */
  grossRevenue: string;
  currency: string;
}

export interface AdminPlatformStatsResponse {
  stats: AdminPlatformStatsDto;
}

export interface TicketLookupRequest {
  email: string;
  ticketNumber: string;
}

export interface TicketLookupResultDto {
  ticketNumber: string;
  status: TicketStatus;
  ticketTypeName: string;
  eventName: string;
  eventSlug: string;
  startsAt: string;
  venueName: string | null;
  qrToken: string;
  orderId: string;
  accessToken: string;
}

export interface TicketLookupResponse {
  ticket: TicketLookupResultDto;
}

export interface PublicEventsQuery {
  q?: string;
  category?: string;
  city?: string;
  dateFrom?: string;
  dateTo?: string;
}

export const PACKAGE_NAME = "@event-ticketing/shared" as const;
