import type { EventStatus } from "@event-ticketing/shared";

export type EventStatusAction =
  | "submit_for_review"
  | "withdraw_review"
  | "approve"
  | "reject"
  | "publish"
  | "open_sales"
  | "pause_sales"
  | "resume_sales"
  | "close_sales"
  | "go_live"
  | "complete"
  | "cancel"
  | "postpone"
  | "unpublish";

const TRANSITIONS: Record<
  EventStatusAction,
  { from: EventStatus[]; to: EventStatus; actor: "organizer" | "admin" }
> = {
  submit_for_review: {
    from: ["DRAFT"],
    to: "PENDING_REVIEW",
    actor: "organizer",
  },
  withdraw_review: {
    from: ["PENDING_REVIEW"],
    to: "DRAFT",
    actor: "organizer",
  },
  approve: {
    from: ["PENDING_REVIEW"],
    to: "APPROVED",
    actor: "admin",
  },
  reject: {
    from: ["PENDING_REVIEW"],
    to: "DRAFT",
    actor: "admin",
  },
  publish: {
    from: ["APPROVED"],
    to: "PUBLISHED",
    actor: "organizer",
  },
  open_sales: {
    from: ["PUBLISHED"],
    to: "SALES_OPEN",
    actor: "organizer",
  },
  pause_sales: {
    from: ["SALES_OPEN"],
    to: "SALES_PAUSED",
    actor: "organizer",
  },
  resume_sales: {
    from: ["SALES_PAUSED"],
    to: "SALES_OPEN",
    actor: "organizer",
  },
  close_sales: {
    from: ["SALES_OPEN", "SALES_PAUSED"],
    to: "SALES_CLOSED",
    actor: "organizer",
  },
  go_live: {
    from: ["SALES_OPEN", "SALES_PAUSED", "SALES_CLOSED"],
    to: "LIVE",
    actor: "organizer",
  },
  complete: {
    from: ["LIVE"],
    to: "COMPLETED",
    actor: "organizer",
  },
  /** Exceptional end state — sales stop; historical tickets remain (plan §15.4). */
  cancel: {
    from: [
      "APPROVED",
      "PUBLISHED",
      "SALES_OPEN",
      "SALES_PAUSED",
      "SALES_CLOSED",
      "LIVE",
      "POSTPONED",
    ],
    to: "CANCELLED",
    actor: "organizer",
  },
  postpone: {
    from: [
      "APPROVED",
      "PUBLISHED",
      "SALES_OPEN",
      "SALES_PAUSED",
      "SALES_CLOSED",
      "LIVE",
    ],
    to: "POSTPONED",
    actor: "organizer",
  },
  /** Admin can pull a live public event back to APPROVED. */
  unpublish: {
    from: [
      "PUBLISHED",
      "SALES_OPEN",
      "SALES_PAUSED",
      "SALES_CLOSED",
      "LIVE",
      "POSTPONED",
    ],
    to: "APPROVED",
    actor: "admin",
  },
};

export function resolveTransition(
  action: EventStatusAction,
  current: EventStatus,
): { ok: true; next: EventStatus } | { ok: false; error: string } {
  const rule = TRANSITIONS[action];
  if (!rule.from.includes(current)) {
    return {
      ok: false,
      error: `Cannot ${action.replaceAll("_", " ")} from status ${current}`,
    };
  }
  return { ok: true, next: rule.to };
}

export function transitionActor(action: EventStatusAction): "organizer" | "admin" {
  return TRANSITIONS[action].actor;
}

/** Minimum content checks before an organizer may submit for review. */
export function validateReadyForReview(event: {
  name: string;
  startsAt: Date;
  endsAt: Date;
  ticketTypeCount: number;
}): string | null {
  if (!event.name.trim()) return "Event name is required";
  if (event.endsAt <= event.startsAt) return "endsAt must be after startsAt";
  if (event.ticketTypeCount < 1) {
    return "Add at least one ticket type before submitting for review";
  }
  return null;
}
