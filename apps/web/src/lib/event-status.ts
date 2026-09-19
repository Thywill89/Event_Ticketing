import type { EventStatus } from "@event-ticketing/shared";

const LABELS: Record<EventStatus, string> = {
  DRAFT: "Draft",
  PENDING_REVIEW: "Pending review",
  APPROVED: "Approved",
  PUBLISHED: "Published",
  SALES_OPEN: "Sales open",
  SALES_PAUSED: "Sales paused",
  SALES_CLOSED: "Sales closed",
  LIVE: "Live",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
  POSTPONED: "Postponed",
};

export function formatEventStatus(status: EventStatus): string {
  return LABELS[status] ?? status;
}
