/** Shared domain stubs for EventTicketing (types only — no runtime deps). */

export type TicketStatus =
  | "ISSUED"
  | "CHECKED_IN"
  | "REFUNDED"
  | "CANCELLED";

export type OrderStatus =
  | "PENDING"
  | "PAID"
  | "FAILED"
  | "REFUNDED"
  | "CANCELLED";

export type PaymentStatus =
  | "PENDING"
  | "SUCCEEDED"
  | "FAILED"
  | "REFUNDED";

export interface TicketDto {
  id: string;
  ticketNumber: string;
  eventId: string;
  status: TicketStatus;
}

export interface OrderDto {
  id: string;
  status: OrderStatus;
  ticketIds: string[];
}

export interface PaymentDto {
  id: string;
  orderId: string;
  status: PaymentStatus;
}

export const PACKAGE_NAME = "@event-ticketing/shared" as const;
