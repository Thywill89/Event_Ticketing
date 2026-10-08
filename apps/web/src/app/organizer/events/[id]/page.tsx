"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";
import type {
  CreateTicketTypeRequest,
  EventDto,
  EventStatus,
  TicketTypeDto,
  UpdateEventRequest,
} from "@event-me/shared";
import { CHECK_IN_ALLOWED_EVENT_STATUSES, isEventDeletable } from "@event-me/shared";
import { DeleteEventDialog } from "@/components/delete-event-dialog";
import { OrganizerShell } from "@/components/organizer-shell";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { EventStatusBadge } from "@/components/event-status-badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FieldError } from "@/components/ui/field-error";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import {
  ApiError,
  cancelEvent,
  closeEventSales,
  completeEvent,
  createTicketType,
  getOrganizerEvent,
  goLiveEvent,
  openEventSales,
  pauseEventSales,
  postponeEvent,
  publishEvent,
  resumeEventSales,
  submitEventForReview,
  updateOrganizerEvent,
  updateTicketType,
  uploadEventMainImage,
  withdrawEventReview,
} from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { toDatetimeLocalValue } from "@/lib/datetime";
import { formatEventStatus } from "@/lib/event-status";
import {
  editEventFormSchema,
  emptyVenueForm,
  ticketTypeFormSchema,
} from "@/lib/form-schemas";

const STATUS_SUCCESS_MESSAGES: Partial<Record<EventStatus, string>> = {
  DRAFT: "Event Withdrawn to Draft Successfully",
  PENDING_REVIEW: "Event Submitted for Review Successfully",
  PUBLISHED: "Event Published Successfully",
  SALES_OPEN: "Ticket Sales Opened Successfully",
  SALES_PAUSED: "Ticket Sales Paused Successfully",
  SALES_CLOSED: "Ticket Sales Closed Successfully",
  LIVE: "Event Is Now Live",
  COMPLETED: "Event Completed Successfully",
  POSTPONED: "Event Postponed Successfully",
  CANCELLED: "Event Cancelled Successfully",
};

function canOpenCheckIn(status: EventStatus): boolean {
  return (CHECK_IN_ALLOWED_EVENT_STATUSES as readonly string[]).includes(status);
}

type EventFormValues = z.input<typeof editEventFormSchema>;
type TicketFormValues = z.input<typeof ticketTypeFormSchema>;

const emptyEventForm: EventFormValues = {
  name: "",
  description: "",
  startsAt: "",
  endsAt: "",
  venue: emptyVenueForm,
};

const emptyTicketForm = (): TicketFormValues => ({
  name: "",
  description: "",
  price: "0",
  quantityTotal: "100",
  salesStartsAt: "",
  salesEndsAt: "",
  isActive: true,
});

export default function EditEventPage() {
  const params = useParams<{ id: string }>();
  const eventId = params.id;
  const { token } = useAuth();

  const [event, setEvent] = useState<EventDto | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveOk, setSaveOk] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [mainImageBusy, setMainImageBusy] = useState(false);

  const [ticketDialogOpen, setTicketDialogOpen] = useState(false);
  const [editingTicket, setEditingTicket] = useState<TicketTypeDto | null>(null);
  const [statusBusy, setStatusBusy] = useState(false);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const router = useRouter();

  const eventForm = useForm<EventFormValues, unknown, UpdateEventRequest>({
    resolver: zodResolver(editEventFormSchema),
    defaultValues: emptyEventForm,
  });
  const eventErrors = eventForm.formState.errors;
  const resetEventForm = eventForm.reset;

  const ticketForm = useForm<TicketFormValues, unknown, CreateTicketTypeRequest>({
    resolver: zodResolver(ticketTypeFormSchema),
    defaultValues: emptyTicketForm(),
  });
  const ticketErrors = ticketForm.formState.errors;

  const applyEvent = useCallback(
    (data: EventDto) => {
      setEvent(data);
      resetEventForm({
        name: data.name,
        description: data.description ?? "",
        startsAt: toDatetimeLocalValue(data.startsAt),
        endsAt: toDatetimeLocalValue(data.endsAt),
        venue: {
          name: data.venue?.name ?? "",
          address: data.venue?.address ?? "",
          city: data.venue?.city ?? "",
        },
      });
    },
    [resetEventForm],
  );

  useEffect(() => {
    if (!token || !eventId) return;
    let cancelled = false;

    async function load() {
      setLoading(true);
      setLoadError(null);
      try {
        const data = await getOrganizerEvent(token!, eventId);
        if (!cancelled) applyEvent(data);
      } catch (err) {
        if (!cancelled) {
          setLoadError(err instanceof ApiError ? err.message : "Failed to load event");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [token, eventId, applyEvent]);

  async function onSaveEvent(body: UpdateEventRequest) {
    if (!token || !eventId) return;
    setSaveError(null);
    setSaveOk(null);
    try {
      const updated = await updateOrganizerEvent(token, eventId, body);
      applyEvent(updated);
      setSaveOk("Event saved.");
    } catch (err) {
      setSaveError(err instanceof ApiError ? err.message : "Failed to save event");
    }
  }

  function openCreateTicket() {
    setEditingTicket(null);
    ticketForm.reset(emptyTicketForm());
    setTicketDialogOpen(true);
  }

  function openEditTicket(tt: TicketTypeDto) {
    setEditingTicket(tt);
    ticketForm.reset({
      name: tt.name,
      description: tt.description ?? "",
      price: tt.price,
      quantityTotal: String(tt.quantityTotal),
      salesStartsAt: tt.salesStartsAt ? toDatetimeLocalValue(tt.salesStartsAt) : "",
      salesEndsAt: tt.salesEndsAt ? toDatetimeLocalValue(tt.salesEndsAt) : "",
      isActive: tt.isActive,
    });
    setTicketDialogOpen(true);
  }

  async function onSaveTicket(payload: CreateTicketTypeRequest) {
    if (!token || !eventId) return;
    try {
      if (editingTicket) {
        await updateTicketType(token, eventId, editingTicket.id, payload);
      } else {
        await createTicketType(token, eventId, payload);
      }
      const refreshed = await getOrganizerEvent(token, eventId);
      applyEvent(refreshed);
      setTicketDialogOpen(false);
    } catch (err) {
      ticketForm.setError("root", {
        message: err instanceof ApiError ? err.message : "Failed to save ticket type",
      });
    }
  }

  async function runStatusAction(
    action: (token: string, eventId: string) => Promise<EventDto>,
  ) {
    if (!token || !eventId) return;
    setStatusError(null);
    setSaveOk(null);
    setStatusBusy(true);
    const previousStatus = event?.status;
    try {
      const updated = await action(token, eventId);
      applyEvent(updated);
      setSaveOk(
        previousStatus === "SALES_PAUSED" && updated.status === "SALES_OPEN"
          ? "Ticket Sales Resumed Successfully"
          : (STATUS_SUCCESS_MESSAGES[updated.status] ??
              `Status updated to ${formatEventStatus(updated.status)}.`),
      );
    } catch (err) {
      setStatusError(err instanceof ApiError ? err.message : "Status update failed");
    } finally {
      setStatusBusy(false);
    }
  }

  function statusActionsFor(status: EventStatus) {
    switch (status) {
      case "DRAFT":
        return (
          <Button
            disabled={statusBusy}
            onClick={() => void runStatusAction(submitEventForReview)}
          >
            {statusBusy ? "Submitting…" : "Submit for review"}
          </Button>
        );
      case "PENDING_REVIEW":
        return (
          <Button
            variant="outline"
            disabled={statusBusy}
            onClick={() => void runStatusAction(withdrawEventReview)}
          >
            {statusBusy ? "Withdrawing…" : "Withdraw to draft"}
          </Button>
        );
      case "APPROVED":
        return (
          <Button
            disabled={statusBusy}
            onClick={() => void runStatusAction(publishEvent)}
          >
            {statusBusy ? "Publishing…" : "Publish event"}
          </Button>
        );
      case "PUBLISHED":
        return (
          <Button
            disabled={statusBusy}
            onClick={() => void runStatusAction(openEventSales)}
          >
            {statusBusy ? "Opening…" : "Open sales"}
          </Button>
        );
      case "SALES_OPEN":
        return (
          <>
            <Button
              variant="outline"
              disabled={statusBusy}
              onClick={() => void runStatusAction(pauseEventSales)}
            >
              Pause sales
            </Button>
            <Button
              variant="outline"
              disabled={statusBusy}
              onClick={() => void runStatusAction(closeEventSales)}
            >
              Close sales
            </Button>
            <Button
              disabled={statusBusy}
              onClick={() => void runStatusAction(goLiveEvent)}
            >
              Go live (doors)
            </Button>
          </>
        );
      case "SALES_PAUSED":
        return (
          <>
            <Button
              disabled={statusBusy}
              onClick={() => void runStatusAction(resumeEventSales)}
            >
              Resume sales
            </Button>
            <Button
              variant="outline"
              disabled={statusBusy}
              onClick={() => void runStatusAction(closeEventSales)}
            >
              Close sales
            </Button>
            <Button
              disabled={statusBusy}
              onClick={() => void runStatusAction(goLiveEvent)}
            >
              Go live (doors)
            </Button>
          </>
        );
      case "SALES_CLOSED":
        return (
          <Button
            disabled={statusBusy}
            onClick={() => void runStatusAction(goLiveEvent)}
          >
            {statusBusy ? "Updating…" : "Go live (doors)"}
          </Button>
        );
      case "LIVE":
        return (
          <>
            <Button
              variant="outline"
              disabled={statusBusy}
              onClick={() => void runStatusAction(completeEvent)}
            >
              {statusBusy ? "Updating…" : "Mark completed"}
            </Button>
            <Button
              variant="outline"
              disabled={statusBusy}
              onClick={() => void runStatusAction(postponeEvent)}
            >
              Postpone
            </Button>
            <Button
              variant="destructive"
              disabled={statusBusy}
              onClick={() => void runStatusAction(cancelEvent)}
            >
              Cancel event
            </Button>
          </>
        );
      case "POSTPONED":
        return (
          <Button
            variant="destructive"
            disabled={statusBusy}
            onClick={() => void runStatusAction(cancelEvent)}
          >
            Cancel event
          </Button>
        );
      default:
        return null;
    }
  }

  function exceptionalActions(status: EventStatus) {
    if (
      !["APPROVED", "PUBLISHED", "SALES_OPEN", "SALES_PAUSED", "SALES_CLOSED"].includes(
        status,
      )
    ) {
      return null;
    }
    return (
      <>
        <Button
          variant="outline"
          disabled={statusBusy}
          onClick={() => void runStatusAction(postponeEvent)}
        >
          Postpone
        </Button>
        <Button
          variant="destructive"
          disabled={statusBusy}
          onClick={() => void runStatusAction(cancelEvent)}
        >
          Cancel event
        </Button>
      </>
    );
  }

  if (loading) {
    return (
      <OrganizerShell title="Edit event">
        <p className="text-sm text-muted-foreground">Loading…</p>
      </OrganizerShell>
    );
  }

  if (loadError || !event) {
    return (
      <OrganizerShell title="Edit event">
        <Alert variant="destructive">
          <AlertDescription>{loadError ?? "Event not found"}</AlertDescription>
        </Alert>
        <Button className="mt-4" variant="outline" render={<Link href="/organizer/events" />}>
          Back to list
        </Button>
      </OrganizerShell>
    );
  }

  const readOnly = event.status !== "DRAFT";
  const workflowActions = statusActionsFor(event.status);
  const exceptionActions = exceptionalActions(event.status);

  return (
    <OrganizerShell
      title={event.name}
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <EventStatusBadge status={event.status} />
          <Button
            variant="outline"
            size="sm"
            render={<Link href={`/organizer/events/${event.id}/orders`} />}
          >
            Orders
          </Button>
          <Button
            variant="outline"
            size="sm"
            render={<Link href={`/organizer/events/${event.id}/attendees`} />}
          >
            Attendees
          </Button>
          <Button
            variant="outline"
            size="sm"
            render={<Link href={`/organizer/events/${event.id}/staff`} />}
          >
            Staff
          </Button>
          {canOpenCheckIn(event.status) ? (
            <Button render={<Link href={`/organizer/events/${event.id}/check-in`} />}>
              Door check-in
            </Button>
          ) : null}
          {isEventDeletable(event.status) ? (
            <Button variant="destructive" size="sm" onClick={() => setDeleteOpen(true)}>
              Delete
            </Button>
          ) : null}
        </div>
      }
    >
      <DeleteEventDialog
        token={token}
        event={event}
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        onDeleted={() => router.push("/organizer/events")}
      />
      {statusError ? (
        <Alert variant="destructive" className="mb-4">
          <AlertDescription>{statusError}</AlertDescription>
        </Alert>
      ) : null}

      {workflowActions || exceptionActions ? (
        <div className="mb-6 flex flex-wrap items-center gap-3">
          {workflowActions}
          {exceptionActions}
        </div>
      ) : null}

      <form
        noValidate
        onSubmit={eventForm.handleSubmit(onSaveEvent)}
        className="grid max-w-2xl gap-6"
      >
        {saveError ? (
          <Alert variant="destructive">
            <AlertDescription>{saveError}</AlertDescription>
          </Alert>
        ) : null}
        {saveOk ? (
          <Alert>
            <AlertDescription>{saveOk}</AlertDescription>
          </Alert>
        ) : null}

        <section className="grid gap-4 rounded-xl bg-background p-4 ring-1 ring-foreground/10">
          <h2 className="font-heading text-sm font-medium">Event</h2>
          <p className="text-xs text-muted-foreground">Slug: {event.slug}</p>
          <div className="grid gap-2">
            <Label htmlFor="name">Event name</Label>
            <Input
              id="name"
              disabled={readOnly}
              aria-invalid={eventErrors.name ? true : undefined}
              {...eventForm.register("name")}
            />
            <FieldError message={eventErrors.name?.message} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              rows={4}
              disabled={readOnly}
              aria-invalid={eventErrors.description ? true : undefined}
              {...eventForm.register("description")}
            />
            <FieldError message={eventErrors.description?.message} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="startsAt">Starts</Label>
              <Input
                id="startsAt"
                type="datetime-local"
                disabled={readOnly}
                aria-invalid={eventErrors.startsAt ? true : undefined}
                {...eventForm.register("startsAt")}
              />
              <FieldError message={eventErrors.startsAt?.message} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="endsAt">Ends</Label>
              <Input
                id="endsAt"
                type="datetime-local"
                disabled={readOnly}
                aria-invalid={eventErrors.endsAt ? true : undefined}
                {...eventForm.register("endsAt")}
              />
              <FieldError message={eventErrors.endsAt?.message} />
            </div>
          </div>
        </section>

        <section className="grid gap-4 rounded-xl bg-background p-4 ring-1 ring-foreground/10">
          <h2 className="font-heading text-sm font-medium">Cover photo</h2>
          {event.mainImageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={event.mainImageUrl}
              alt=""
              className="h-40 w-full max-w-md rounded-lg object-cover ring-1 ring-foreground/10"
            />
          ) : (
            <p className="text-sm text-muted-foreground">No cover photo yet.</p>
          )}
          {!readOnly ? (
            <div className="grid gap-2">
              <Label htmlFor="mainImageFile">Upload cover photo</Label>
              <Input
                id="mainImageFile"
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                disabled={mainImageBusy}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  if (!file || !token || !eventId) return;
                  setMainImageBusy(true);
                  setSaveError(null);
                  void uploadEventMainImage(token, eventId, file)
                    .then((updated) => {
                      applyEvent(updated);
                      setSaveOk("Cover photo updated.");
                    })
                    .catch((err) => {
                      setSaveError(
                        err instanceof ApiError
                          ? err.message
                          : "Failed to upload cover photo",
                      );
                    })
                    .finally(() => setMainImageBusy(false));
                }}
              />
              <p className="text-xs text-muted-foreground">
                JPEG, PNG, WebP, or GIF — up to 5 MB.
                {mainImageBusy ? " Uploading…" : ""}
              </p>
            </div>
          ) : null}
        </section>

        <section className="grid gap-4 rounded-xl bg-background p-4 ring-1 ring-foreground/10">
          <h2 className="font-heading text-sm font-medium">Venue</h2>
          <div className="grid gap-2">
            <Label htmlFor="venueName">Venue name</Label>
            <Input
              id="venueName"
              disabled={readOnly}
              aria-invalid={eventErrors.venue?.name ? true : undefined}
              {...eventForm.register("venue.name")}
            />
            <FieldError message={eventErrors.venue?.name?.message} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="venueAddress">Address</Label>
            <Input
              id="venueAddress"
              disabled={readOnly}
              aria-invalid={eventErrors.venue?.address ? true : undefined}
              {...eventForm.register("venue.address")}
            />
            <FieldError message={eventErrors.venue?.address?.message} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="venueCity">City</Label>
            <Input
              id="venueCity"
              disabled={readOnly}
              aria-invalid={eventErrors.venue?.city ? true : undefined}
              {...eventForm.register("venue.city")}
            />
            <FieldError message={eventErrors.venue?.city?.message} />
          </div>
        </section>

        {!readOnly ? (
          <div>
            <Button type="submit" disabled={eventForm.formState.isSubmitting}>
              {eventForm.formState.isSubmitting ? "Saving…" : "Save event"}
            </Button>
          </div>
        ) : null}
      </form>

      <section className="mt-10 grid gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-heading text-lg font-semibold tracking-tight">Ticket types</h2>
          {!readOnly ? (
            <Button type="button" onClick={openCreateTicket}>
              Add ticket type
            </Button>
          ) : null}
        </div>

        {(event.ticketTypes?.length ?? 0) === 0 ? (
          <p className="text-sm text-muted-foreground">
            No ticket types yet. Add Early Bird, VIP, or Regular inventory here.
          </p>
        ) : (
          <div className="overflow-hidden rounded-xl bg-background ring-1 ring-foreground/10">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Price</TableHead>
                  <TableHead>Qty</TableHead>
                  <TableHead>Active</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {event.ticketTypes!.map((tt) => (
                  <TableRow key={tt.id}>
                    <TableCell className="font-medium">{tt.name}</TableCell>
                    <TableCell>
                      {tt.currency} {tt.price}
                    </TableCell>
                    <TableCell>
                      {tt.quantitySold + tt.quantityReserved}/{tt.quantityTotal}
                    </TableCell>
                    <TableCell>{tt.isActive ? "Yes" : "No"}</TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={readOnly}
                        onClick={() => openEditTicket(tt)}
                      >
                        Edit
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>

      <Dialog open={ticketDialogOpen} onOpenChange={setTicketDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editingTicket ? "Edit ticket type" : "Add ticket type"}
            </DialogTitle>
            <DialogDescription>
              Configure price, inventory, and optional sales window.
            </DialogDescription>
          </DialogHeader>
          <form
            noValidate
            onSubmit={ticketForm.handleSubmit(onSaveTicket)}
            className="grid gap-3"
          >
            {ticketErrors.root?.message ? (
              <Alert variant="destructive">
                <AlertDescription>{ticketErrors.root.message}</AlertDescription>
              </Alert>
            ) : null}
            <div className="grid gap-2">
              <Label htmlFor="tt-name">Name</Label>
              <Input
                id="tt-name"
                aria-invalid={ticketErrors.name ? true : undefined}
                {...ticketForm.register("name")}
              />
              <FieldError message={ticketErrors.name?.message} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="tt-desc">Description</Label>
              <Textarea
                id="tt-desc"
                rows={2}
                aria-invalid={ticketErrors.description ? true : undefined}
                {...ticketForm.register("description")}
              />
              <FieldError message={ticketErrors.description?.message} />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="tt-price">Price (GHS)</Label>
                <Input
                  id="tt-price"
                  inputMode="decimal"
                  aria-invalid={ticketErrors.price ? true : undefined}
                  {...ticketForm.register("price")}
                />
                <FieldError message={ticketErrors.price?.message} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="tt-qty">Quantity</Label>
                <Input
                  id="tt-qty"
                  type="number"
                  min={0}
                  aria-invalid={ticketErrors.quantityTotal ? true : undefined}
                  {...ticketForm.register("quantityTotal")}
                />
                <FieldError message={ticketErrors.quantityTotal?.message} />
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="tt-sales-start">Sales start</Label>
                <Input
                  id="tt-sales-start"
                  type="datetime-local"
                  aria-invalid={ticketErrors.salesStartsAt ? true : undefined}
                  {...ticketForm.register("salesStartsAt")}
                />
                <FieldError message={ticketErrors.salesStartsAt?.message} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="tt-sales-end">Sales end</Label>
                <Input
                  id="tt-sales-end"
                  type="datetime-local"
                  aria-invalid={ticketErrors.salesEndsAt ? true : undefined}
                  {...ticketForm.register("salesEndsAt")}
                />
                <FieldError message={ticketErrors.salesEndsAt?.message} />
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" {...ticketForm.register("isActive")} />
              Active for sale (when sales open)
            </label>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setTicketDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={ticketForm.formState.isSubmitting}>
                {ticketForm.formState.isSubmitting ? "Saving…" : "Save ticket type"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </OrganizerShell>
  );
}
