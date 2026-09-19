import type {
  AddGalleryImageRequest,
  AdminEventDto,
  AdminEventListResponse,
  AdminEventResponse,
  AdminOrderListResponse,
  AdminOrganizerListResponse,
  AdminOrganizerResponse,
  AdminPlatformStatsResponse,
  AuthUserDto,
  CheckInListResponse,
  CheckInResponse,
  CheckInStatsResponse,
  CreateEventRequest,
  CreateOrderRequest,
  CreateOrderResponse,
  CreateOrganizerStaffRequest,
  CreateTicketTypeRequest,
  EventDto,
  EventGalleryResponse,
  EventStaffListResponse,
  EventStatus,
  InitializePaymentResponse,
  LoginResponse,
  OrderDetailDto,
  OrderResponse,
  OrderStatus,
  OrganizerAttendeeListResponse,
  OrganizerDashboardResponse,
  OrganizerEventListResponse,
  OrganizerEventResponse,
  OrganizerOrderListResponse,
  OrganizerRegisterResponse,
  OrganizerStaffListResponse,
  OrganizerStaffResponse,
  OrganizerStatus,
  OrganizerTicketTypeResponse,
  PaymentConfigResponse,
  PerformCheckInRequest,
  PublicEventDto,
  PublicEventListResponse,
  PublicEventResponse,
  RefreshTokenResponse,
  RejectEventRequest,
  StaffEventListResponse,
  TicketLookupRequest,
  TicketLookupResponse,
  TicketTypeDto,
  UpdateEventRequest,
  UpdateOrganizerStaffRequest,
  UpdateTicketTypeRequest,
} from "@event-ticketing/shared";
import { getAccessToken, setAccessToken } from "@/lib/access-token";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export class ApiError extends Error {
  status: number;
  details?: unknown;
  code?: string;
  /** Full check-in denial payload when present. */
  checkIn?: CheckInResponse;

  constructor(
    message: string,
    status: number,
    details?: unknown,
    code?: string,
    checkIn?: CheckInResponse,
  ) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.details = details;
    this.code = code;
    this.checkIn = checkIn;
  }
}

type RequestOptions = {
  method?: string;
  body?: unknown;
  token?: string | null;
  /** Skip silent refresh retry (used by /auth/refresh itself). */
  skipRefresh?: boolean;
};

let refreshInFlight: Promise<string | null> | null = null;

/** Exchange httpOnly refresh cookie for a new access JWT. */
export async function refreshAccessSession(): Promise<RefreshTokenResponse | null> {
  const res = await fetch(`${API_URL}/auth/refresh`, {
    method: "POST",
    credentials: "include",
    headers: { Accept: "application/json" },
  });
  if (!res.ok) return null;
  const data = (await res.json()) as RefreshTokenResponse;
  setAccessToken(data.token);
  return data;
}

async function getRefreshedAccessToken(): Promise<string | null> {
  if (!refreshInFlight) {
    refreshInFlight = (async () => {
      try {
        const session = await refreshAccessSession();
        return session?.token ?? null;
      } catch {
        return null;
      } finally {
        refreshInFlight = null;
      }
    })();
  }
  return refreshInFlight;
}

async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = {
    Accept: "application/json",
  };
  if (options.body !== undefined) {
    headers["Content-Type"] = "application/json";
  }
  const token = options.token !== undefined ? options.token : getAccessToken();
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const res = await fetch(`${API_URL}${path}`, {
    method: options.method ?? (options.body !== undefined ? "POST" : "GET"),
    headers,
    credentials: "include",
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });

  if (res.status === 401 && !options.skipRefresh && path !== "/auth/refresh") {
    const next = await getRefreshedAccessToken();
    if (next) {
      return apiRequest<T>(path, {
        ...options,
        token: next,
        skipRefresh: true,
      });
    }
  }

  const text = await res.text();
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text) as unknown;
    } catch {
      data = { error: text };
    }
  }

  if (!res.ok) {
    const errObj = data as
      | {
          error?: string;
          details?: unknown;
          code?: string;
          ok?: boolean;
          message?: string;
        }
      | null;

    const checkIn =
      errObj && typeof errObj === "object" && errObj.ok === false
        ? (data as CheckInResponse)
        : undefined;

    throw new ApiError(
      checkIn && !checkIn.ok
        ? checkIn.message
        : (errObj?.error ?? `Request failed (${res.status})`),
      res.status,
      errObj?.details,
      checkIn && !checkIn.ok ? checkIn.code : errObj?.code,
      checkIn,
    );
  }

  return data as T;
}

export function getApiBaseUrl() {
  return API_URL;
}

export async function registerOrganizer(input: {
  email: string;
  password: string;
  fullName: string;
  displayName: string;
  phone?: string;
}): Promise<OrganizerRegisterResponse> {
  return apiRequest<OrganizerRegisterResponse>("/auth/organizer/register", {
    method: "POST",
    body: input,
    skipRefresh: true,
  });
}

export async function login(input: {
  email: string;
  password: string;
}): Promise<LoginResponse> {
  return apiRequest<LoginResponse>("/auth/login", {
    method: "POST",
    body: input,
    skipRefresh: true,
  });
}

export async function logoutSession(): Promise<void> {
  try {
    await apiRequest<{ ok: boolean }>("/auth/logout", {
      method: "POST",
      skipRefresh: true,
      token: null,
    });
  } catch {
    // Cookie may already be gone — still clear local access token.
  }
}

export async function fetchMe(token: string): Promise<{ user: AuthUserDto }> {
  return apiRequest<{ user: AuthUserDto }>("/auth/me", { token });
}

export async function listOrganizerEvents(token: string): Promise<EventDto[]> {
  const data = await apiRequest<OrganizerEventListResponse>("/organizer/events", {
    token,
  });
  return data.events;
}

export async function getOrganizerEvent(
  token: string,
  eventId: string,
): Promise<EventDto> {
  const data = await apiRequest<OrganizerEventResponse>(
    `/organizer/events/${eventId}`,
    { token },
  );
  return data.event;
}

export async function createOrganizerEvent(
  token: string,
  body: CreateEventRequest,
): Promise<EventDto> {
  const data = await apiRequest<OrganizerEventResponse>("/organizer/events", {
    method: "POST",
    token,
    body,
  });
  return data.event;
}

export async function updateOrganizerEvent(
  token: string,
  eventId: string,
  body: UpdateEventRequest,
): Promise<EventDto> {
  const data = await apiRequest<OrganizerEventResponse>(
    `/organizer/events/${eventId}`,
    { method: "PATCH", token, body },
  );
  return data.event;
}

export async function createTicketType(
  token: string,
  eventId: string,
  body: CreateTicketTypeRequest,
): Promise<TicketTypeDto> {
  const data = await apiRequest<OrganizerTicketTypeResponse>(
    `/organizer/events/${eventId}/ticket-types`,
    { method: "POST", token, body },
  );
  return data.ticketType;
}

export async function updateTicketType(
  token: string,
  eventId: string,
  ticketTypeId: string,
  body: UpdateTicketTypeRequest,
): Promise<TicketTypeDto> {
  const data = await apiRequest<OrganizerTicketTypeResponse>(
    `/organizer/events/${eventId}/ticket-types/${ticketTypeId}`,
    { method: "PATCH", token, body },
  );
  return data.ticketType;
}

async function postOrganizerEventAction(
  token: string,
  eventId: string,
  action:
    | "submit-for-review"
    | "withdraw-review"
    | "publish"
    | "open-sales"
    | "pause-sales"
    | "resume-sales"
    | "close-sales"
    | "go-live"
    | "complete"
    | "cancel"
    | "postpone",
): Promise<EventDto> {
  const data = await apiRequest<OrganizerEventResponse>(
    `/organizer/events/${eventId}/${action}`,
    { method: "POST", token },
  );
  return data.event;
}

export function submitEventForReview(token: string, eventId: string) {
  return postOrganizerEventAction(token, eventId, "submit-for-review");
}

export function withdrawEventReview(token: string, eventId: string) {
  return postOrganizerEventAction(token, eventId, "withdraw-review");
}

export function publishEvent(token: string, eventId: string) {
  return postOrganizerEventAction(token, eventId, "publish");
}

export function openEventSales(token: string, eventId: string) {
  return postOrganizerEventAction(token, eventId, "open-sales");
}

export function pauseEventSales(token: string, eventId: string) {
  return postOrganizerEventAction(token, eventId, "pause-sales");
}

export function resumeEventSales(token: string, eventId: string) {
  return postOrganizerEventAction(token, eventId, "resume-sales");
}

export function closeEventSales(token: string, eventId: string) {
  return postOrganizerEventAction(token, eventId, "close-sales");
}

export function goLiveEvent(token: string, eventId: string) {
  return postOrganizerEventAction(token, eventId, "go-live");
}

export function completeEvent(token: string, eventId: string) {
  return postOrganizerEventAction(token, eventId, "complete");
}

export function cancelEvent(token: string, eventId: string) {
  return postOrganizerEventAction(token, eventId, "cancel");
}

export function postponeEvent(token: string, eventId: string) {
  return postOrganizerEventAction(token, eventId, "postpone");
}

export async function listAdminEvents(
  token: string,
  status: EventStatus = "PENDING_REVIEW",
): Promise<AdminEventDto[]> {
  const data = await apiRequest<AdminEventListResponse>(
    `/admin/events?status=${encodeURIComponent(status)}`,
    { token },
  );
  return data.events;
}

export async function approveAdminEvent(
  token: string,
  eventId: string,
): Promise<AdminEventDto> {
  const data = await apiRequest<AdminEventResponse>(
    `/admin/events/${eventId}/approve`,
    { method: "POST", token },
  );
  return data.event;
}

export async function rejectAdminEvent(
  token: string,
  eventId: string,
  body: RejectEventRequest = {},
): Promise<AdminEventDto> {
  const data = await apiRequest<AdminEventResponse>(
    `/admin/events/${eventId}/reject`,
    { method: "POST", token, body },
  );
  return data.event;
}

export async function unpublishAdminEvent(
  token: string,
  eventId: string,
): Promise<AdminEventDto> {
  const data = await apiRequest<AdminEventResponse>(
    `/admin/events/${eventId}/unpublish`,
    { method: "POST", token },
  );
  return data.event;
}

export async function cancelAdminEvent(
  token: string,
  eventId: string,
): Promise<AdminEventDto> {
  const data = await apiRequest<AdminEventResponse>(
    `/admin/events/${eventId}/cancel`,
    { method: "POST", token },
  );
  return data.event;
}

export async function listPublicEvents(query?: {
  q?: string;
  category?: string;
  city?: string;
  dateFrom?: string;
  dateTo?: string;
}): Promise<PublicEventDto[]> {
  const params = new URLSearchParams();
  if (query?.q) params.set("q", query.q);
  if (query?.category) params.set("category", query.category);
  if (query?.city) params.set("city", query.city);
  if (query?.dateFrom) params.set("dateFrom", query.dateFrom);
  if (query?.dateTo) params.set("dateTo", query.dateTo);
  const qs = params.toString();
  const data = await apiRequest<PublicEventListResponse>(
    `/events${qs ? `?${qs}` : ""}`,
  );
  return data.events;
}

export async function getPublicEvent(slugOrId: string): Promise<PublicEventDto> {
  const data = await apiRequest<PublicEventResponse>(
    `/events/${encodeURIComponent(slugOrId)}`,
  );
  return data.event;
}

export async function createOrder(
  eventId: string,
  body: CreateOrderRequest,
): Promise<OrderDetailDto> {
  const data = await apiRequest<CreateOrderResponse>(
    `/events/${encodeURIComponent(eventId)}/orders`,
    { method: "POST", body },
  );
  return data.order;
}

export async function getOrder(
  orderId: string,
  access: { accessToken?: string; email?: string },
): Promise<OrderDetailDto> {
  const params = new URLSearchParams();
  if (access.accessToken) params.set("accessToken", access.accessToken);
  if (access.email) params.set("email", access.email);
  const qs = params.toString();
  const data = await apiRequest<OrderResponse>(
    `/orders/${encodeURIComponent(orderId)}${qs ? `?${qs}` : ""}`,
  );
  return data.order;
}

export async function completeStubPayment(
  orderId: string,
  access: { accessToken?: string; email?: string },
): Promise<OrderDetailDto> {
  const data = await apiRequest<OrderResponse>(
    `/orders/${encodeURIComponent(orderId)}/payments/stub-complete`,
    {
      method: "POST",
      body: {
        accessToken: access.accessToken,
        email: access.email,
      },
    },
  );
  return data.order;
}

export async function getPaymentConfig(): Promise<PaymentConfigResponse> {
  return apiRequest<PaymentConfigResponse>("/payments/config");
}

export async function initializePayment(
  orderId: string,
  access: { accessToken?: string; email?: string },
): Promise<InitializePaymentResponse> {
  return apiRequest<InitializePaymentResponse>(
    `/orders/${encodeURIComponent(orderId)}/payments/initialize`,
    {
      method: "POST",
      body: {
        accessToken: access.accessToken,
        email: access.email,
      },
    },
  );
}

export async function verifyPayment(
  orderId: string,
  access: { accessToken?: string; email?: string },
  reference?: string,
): Promise<OrderDetailDto> {
  const data = await apiRequest<OrderResponse>(
    `/orders/${encodeURIComponent(orderId)}/payments/verify`,
    {
      method: "POST",
      body: {
        accessToken: access.accessToken,
        email: access.email,
        reference,
      },
    },
  );
  return data.order;
}

export async function performCheckIn(
  token: string,
  eventId: string,
  body: PerformCheckInRequest,
): Promise<CheckInResponse> {
  return apiRequest<CheckInResponse>(
    `/events/${encodeURIComponent(eventId)}/check-ins`,
    { method: "POST", token, body },
  );
}

export async function getCheckInStats(token: string, eventId: string) {
  const data = await apiRequest<CheckInStatsResponse>(
    `/events/${encodeURIComponent(eventId)}/check-ins/stats`,
    { token },
  );
  return data.stats;
}

export async function listCheckIns(token: string, eventId: string, limit = 50) {
  const data = await apiRequest<CheckInListResponse>(
    `/events/${encodeURIComponent(eventId)}/check-ins?limit=${limit}`,
    { token },
  );
  return data.checkIns;
}

export async function listStaffEvents(token: string) {
  const data = await apiRequest<StaffEventListResponse>("/staff/events", {
    token,
  });
  return data.events;
}

export async function listOrganizerStaff(token: string) {
  const data = await apiRequest<OrganizerStaffListResponse>("/organizer/staff", {
    token,
  });
  return data.staff;
}

export async function createOrganizerStaff(
  token: string,
  body: CreateOrganizerStaffRequest,
) {
  const data = await apiRequest<OrganizerStaffResponse>("/organizer/staff", {
    method: "POST",
    token,
    body,
  });
  return data.staff;
}

export async function updateOrganizerStaff(
  token: string,
  staffId: string,
  body: UpdateOrganizerStaffRequest,
) {
  const data = await apiRequest<OrganizerStaffResponse>(
    `/organizer/staff/${staffId}`,
    { method: "PATCH", token, body },
  );
  return data.staff;
}

export async function listEventStaff(token: string, eventId: string) {
  const data = await apiRequest<EventStaffListResponse>(
    `/organizer/events/${eventId}/staff`,
    { token },
  );
  return data.staff;
}

export async function assignEventStaff(
  token: string,
  eventId: string,
  staffId: string,
) {
  const data = await apiRequest<EventStaffListResponse>(
    `/organizer/events/${eventId}/staff`,
    { method: "POST", token, body: { staffId } },
  );
  return data.staff;
}

export async function unassignEventStaff(
  token: string,
  eventId: string,
  staffId: string,
) {
  await apiRequest<null>(`/organizer/events/${eventId}/staff/${staffId}`, {
    method: "DELETE",
    token,
  });
}

export async function getOrganizerDashboard(token: string) {
  const data = await apiRequest<OrganizerDashboardResponse>(
    "/organizer/dashboard",
    { token },
  );
  return data.stats;
}

export async function listOrganizerEventOrders(token: string, eventId: string) {
  const data = await apiRequest<OrganizerOrderListResponse>(
    `/organizer/events/${eventId}/orders`,
    { token },
  );
  return data.orders;
}

export async function listOrganizerEventAttendees(
  token: string,
  eventId: string,
) {
  const data = await apiRequest<OrganizerAttendeeListResponse>(
    `/organizer/events/${eventId}/attendees`,
    { token },
  );
  return data.attendees;
}

export async function listEventGallery(token: string, eventId: string) {
  const data = await apiRequest<EventGalleryResponse>(
    `/organizer/events/${eventId}/gallery`,
    { token },
  );
  return data.images;
}

export async function addEventGalleryImage(
  token: string,
  eventId: string,
  body: AddGalleryImageRequest,
) {
  const data = await apiRequest<EventGalleryResponse>(
    `/organizer/events/${eventId}/gallery`,
    { method: "POST", token, body },
  );
  return data.images;
}

export async function removeEventGalleryImage(
  token: string,
  eventId: string,
  imageId: string,
) {
  await apiRequest<null>(
    `/organizer/events/${eventId}/gallery/${imageId}`,
    { method: "DELETE", token },
  );
}

export async function getAdminStats(token: string) {
  const data = await apiRequest<AdminPlatformStatsResponse>("/admin/stats", {
    token,
  });
  return data.stats;
}

export async function listAdminOrganizers(
  token: string,
  status?: OrganizerStatus,
) {
  const qs = status ? `?status=${encodeURIComponent(status)}` : "";
  const data = await apiRequest<AdminOrganizerListResponse>(
    `/admin/organizers${qs}`,
    { token },
  );
  return data.organizers;
}

export async function approveAdminOrganizer(token: string, organizerId: string) {
  const data = await apiRequest<AdminOrganizerResponse>(
    `/admin/organizers/${organizerId}/approve`,
    { method: "POST", token },
  );
  return data.organizer;
}

export async function suspendAdminOrganizer(token: string, organizerId: string) {
  const data = await apiRequest<AdminOrganizerResponse>(
    `/admin/organizers/${organizerId}/suspend`,
    { method: "POST", token },
  );
  return data.organizer;
}

export async function reinstateAdminOrganizer(
  token: string,
  organizerId: string,
) {
  const data = await apiRequest<AdminOrganizerResponse>(
    `/admin/organizers/${organizerId}/reinstate`,
    { method: "POST", token },
  );
  return data.organizer;
}

export async function listAdminOrders(
  token: string,
  opts?: { status?: OrderStatus; limit?: number },
) {
  const params = new URLSearchParams();
  if (opts?.status) params.set("status", opts.status);
  if (opts?.limit) params.set("limit", String(opts.limit));
  const qs = params.toString();
  const data = await apiRequest<AdminOrderListResponse>(
    `/admin/orders${qs ? `?${qs}` : ""}`,
    { token },
  );
  return data.orders;
}

export async function lookupTicket(body: TicketLookupRequest) {
  const data = await apiRequest<TicketLookupResponse>("/tickets/lookup", {
    method: "POST",
    body,
  });
  return data.ticket;
}
