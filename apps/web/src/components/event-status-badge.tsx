import type { EventStatus } from "@event-me/shared";
import { Badge } from "@/components/ui/badge";
import { formatEventStatus } from "@/lib/event-status";

export function EventStatusBadge({
  status,
  className,
}: {
  status: EventStatus;
  className?: string;
}) {
  if (status === "LIVE") {
    return (
      <Badge className={`bg-emerald-100 text-emerald-800 ${className ?? ""}`}>
        <span className="size-1.5 rounded-full bg-emerald-500" aria-hidden />
        {formatEventStatus(status)}
      </Badge>
    );
  }

  return (
    <Badge variant="secondary" className={className}>
      {formatEventStatus(status)}
    </Badge>
  );
}
