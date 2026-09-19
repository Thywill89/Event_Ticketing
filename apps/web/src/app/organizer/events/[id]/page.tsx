"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { FormEvent, useCallback, useEffect, useState } from "react";
import type { EventDto, EventGalleryImageDto, EventStatus, TicketTypeDto, UpdateEventRequest } from "@event-ticketing/shared";
import { CHECK_IN_ALLOWED_EVENT_STATUSES } from "@event-ticketing/shared";
import { OrganizerShell } from "@/components/organizer-shell";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
  addEventGalleryImage,
  cancelEvent,
  closeEventSales,
  completeEvent,
  createTicketType,
  getOrganizerEvent,
  goLiveEvent,
  listEventGallery,
  openEventSales,
  pauseEventSales,
  postponeEvent,
  publishEvent,
  removeEventGalleryImage,
  resumeEventSales,
  submitEventForReview,
  updateOrganizerEvent,
  updateTicketType,
  withdrawEventReview,
} from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { fromDatetimeLocalValue, toDatetimeLocalValue } from "@/lib/datetime";
import { formatEventStatus } from "@/lib/event-status";

function canOpenCheckIn(status: EventStatus): boolean {
  return (CHECK_IN_ALLOWED_EVENT_STATUSES as readonly string[]).includes(status);
}

type TicketFormState = {
  name: string;
  description: string;
  price: string;
  quantityTotal: string;
  salesStartsAt: string;
  salesEndsAt: string;
  isActive: boolean;
};

const emptyTicketForm = (): TicketFormState => ({
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
  const [saving, setSaving] = useState(false);

  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [description, setDescription] = useState("");
  const [mainImageUrl, setMainImageUrl] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [dressCode, setDressCode] = useState("");
  const [ageRestriction, setAgeRestriction] = useState("");
  const [rules, setRules] = useState("");
  const [notices, setNotices] = useState("");
  const [contactDetails, setContactDetails] = useState("");
  const [venueName, setVenueName] = useState("");
  const [venueAddress, setVenueAddress] = useState("");
  const [venueCity, setVenueCity] = useState("");
  const [venueArea, setVenueArea] = useState("");
  const [gallery, setGallery] = useState<EventGalleryImageDto[]>([]);
  const [galleryUrl, setGalleryUrl] = useState("");
  const [galleryBusy, setGalleryBusy] = useState(false);

  const [ticketDialogOpen, setTicketDialogOpen] = useState(false);
  const [editingTicket, setEditingTicket] = useState<TicketTypeDto | null>(null);
  const [ticketForm, setTicketForm] = useState<TicketFormState>(emptyTicketForm);
  const [ticketError, setTicketError] = useState<string | null>(null);
  const [ticketSaving, setTicketSaving] = useState(false);
  const [statusBusy, setStatusBusy] = useState(false);
  const [statusError, setStatusError] = useState<string | null>(null);

  const applyEvent = useCallback((data: EventDto) => {
    setEvent(data);
    setName(data.name);
    setCategory(data.category ?? "");
    setDescription(data.description ?? "");
    setMainImageUrl(data.mainImageUrl ?? "");
    setStartsAt(toDatetimeLocalValue(data.startsAt));
    setEndsAt(toDatetimeLocalValue(data.endsAt));
    setDressCode(data.dressCode ?? "");
    setAgeRestriction(data.ageRestriction ?? "");
    setRules(data.rules ?? "");
    setNotices(data.notices ?? "");
    setContactDetails(data.contactDetails ?? "");
    setVenueName(data.venue?.name ?? "");
    setVenueAddress(data.venue?.address ?? "");
    setVenueCity(data.venue?.city ?? "");
    setVenueArea(data.venue?.area ?? "");
  }, []);

  useEffect(() => {
    if (!token || !eventId) return;
    let cancelled = false;

    async function load() {
      setLoading(true);
      setLoadError(null);
      try {
        const data = await getOrganizerEvent(token!, eventId);
        if (!cancelled) applyEvent(data);
        const images = await listEventGallery(token!, eventId);
        if (!cancelled) setGallery(images);
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

  async function onSaveEvent(e: FormEvent) {
    e.preventDefault();
    if (!token || !eventId) return;
    setSaveError(null);
    setSaveOk(null);
    setSaving(true);

    const body: UpdateEventRequest = {
      name: name.trim(),
      category: category.trim() || null,
      description: description.trim() || null,
      mainImageUrl: mainImageUrl.trim() || null,
      startsAt: fromDatetimeLocalValue(startsAt),
      endsAt: fromDatetimeLocalValue(endsAt),
      dressCode: dressCode.trim() || null,
      ageRestriction: ageRestriction.trim() || null,
      rules: rules.trim() || null,
      notices: notices.trim() || null,
      contactDetails: contactDetails.trim() || null,
    };

    if (venueName.trim() && venueAddress.trim()) {
      body.venue = {
        name: venueName.trim(),
        address: venueAddress.trim(),
        city: venueCity.trim() || null,
        area: venueArea.trim() || null,
      };
    } else if (!venueName.trim() && !venueAddress.trim()) {
      body.venue = null;
    }

    try {
      const updated = await updateOrganizerEvent(token, eventId, body);
      applyEvent(updated);
      setSaveOk("Event saved.");
    } catch (err) {
      setSaveError(err instanceof ApiError ? err.message : "Failed to save event");
    } finally {
      setSaving(false);
    }
  }

  function openCreateTicket() {
    setEditingTicket(null);
    setTicketForm(emptyTicketForm());
    setTicketError(null);
    setTicketDialogOpen(true);
  }

  function openEditTicket(tt: TicketTypeDto) {
    setEditingTicket(tt);
    setTicketForm({
      name: tt.name,
      description: tt.description ?? "",
      price: tt.price,
      quantityTotal: String(tt.quantityTotal),
      salesStartsAt: tt.salesStartsAt ? toDatetimeLocalValue(tt.salesStartsAt) : "",
      salesEndsAt: tt.salesEndsAt ? toDatetimeLocalValue(tt.salesEndsAt) : "",
      isActive: tt.isActive,
    });
    setTicketError(null);
    setTicketDialogOpen(true);
  }

  async function onSaveTicket(e: FormEvent) {
    e.preventDefault();
    if (!token || !eventId) return;
    setTicketError(null);
    setTicketSaving(true);

    const payload = {
      name: ticketForm.name.trim(),
      description: ticketForm.description.trim() || null,
      price: ticketForm.price,
      quantityTotal: Number(ticketForm.quantityTotal),
      salesStartsAt: ticketForm.salesStartsAt
        ? fromDatetimeLocalValue(ticketForm.salesStartsAt)
        : null,
      salesEndsAt: ticketForm.salesEndsAt
        ? fromDatetimeLocalValue(ticketForm.salesEndsAt)
        : null,
      isActive: ticketForm.isActive,
    };

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
      setTicketError(err instanceof ApiError ? err.message : "Failed to save ticket type");
    } finally {
      setTicketSaving(false);
    }
  }

  async function runStatusAction(
    action: (token: string, eventId: string) => Promise<EventDto>,
  ) {
    if (!token || !eventId) return;
    setStatusError(null);
    setSaveOk(null);
    setStatusBusy(true);
    try {
      const updated = await action(token, eventId);
      applyEvent(updated);
      setSaveOk(`Status updated to ${formatEventStatus(updated.status)}.`);
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
          <Badge variant="secondary">{formatEventStatus(event.status)}</Badge>
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
          {event.status !== "DRAFT" &&
          event.status !== "PENDING_REVIEW" &&
          event.status !== "APPROVED" ? (
            <Button variant="outline" render={<Link href={`/events/${event.slug}`} />}>
              View public page
            </Button>
          ) : null}
          <Button variant="outline" render={<Link href="/organizer/events" />}>
            Back
          </Button>
        </div>
      }
    >
      {statusError ? (
        <Alert variant="destructive" className="mb-4">
          <AlertDescription>{statusError}</AlertDescription>
        </Alert>
      ) : null}

      {workflowActions || exceptionActions ? (
        <section className="mb-6 flex flex-wrap items-center gap-3 rounded-xl bg-background p-4 ring-1 ring-foreground/10">
          <div className="mr-auto">
            <h2 className="font-heading text-sm font-medium">Publishing workflow</h2>
            <p className="text-xs text-muted-foreground">
              Draft → review → approve → publish → open sales. Cancel / postpone notify purchasers.
            </p>
          </div>
          {workflowActions}
          {exceptionActions}
        </section>
      ) : null}

      {readOnly ? (
        <Alert className="mb-4">
          <AlertDescription>
            This event is {formatEventStatus(event.status)}. Content edits are limited to draft
            events — withdraw or wait for rejection to edit again.
          </AlertDescription>
        </Alert>
      ) : null}

      <form onSubmit={onSaveEvent} className="grid max-w-2xl gap-6">
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
          <h2 className="font-heading text-sm font-medium">Basic information</h2>
          <p className="text-xs text-muted-foreground">Slug: {event.slug}</p>
          <div className="grid gap-2">
            <Label htmlFor="name">Event name</Label>
            <Input
              id="name"
              required
              disabled={readOnly}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="category">Category</Label>
            <Input
              id="category"
              disabled={readOnly}
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              rows={4}
              disabled={readOnly}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="mainImageUrl">Main image URL</Label>
            <Input
              id="mainImageUrl"
              type="url"
              disabled={readOnly}
              placeholder="https://…"
              value={mainImageUrl}
              onChange={(e) => setMainImageUrl(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Paste a public HTTPS image URL (Supabase Storage / CDN). Binary upload comes later.
            </p>
          </div>
        </section>

        <section className="grid gap-4 rounded-xl bg-background p-4 ring-1 ring-foreground/10">
          <h2 className="font-heading text-sm font-medium">Gallery</h2>
          <div className="flex flex-wrap gap-2">
            <Input
              type="url"
              placeholder="https://image-url…"
              value={galleryUrl}
              onChange={(e) => setGalleryUrl(e.target.value)}
              className="max-w-md"
            />
            <Button
              type="button"
              variant="outline"
              disabled={galleryBusy || !galleryUrl.trim()}
              onClick={() => {
                if (!token || !eventId) return;
                setGalleryBusy(true);
                void addEventGalleryImage(token, eventId, { url: galleryUrl.trim() })
                  .then(async () => {
                    setGalleryUrl("");
                    setGallery(await listEventGallery(token, eventId));
                  })
                  .catch((err) => {
                    setSaveError(
                      err instanceof ApiError ? err.message : "Failed to add image",
                    );
                  })
                  .finally(() => setGalleryBusy(false));
              }}
            >
              Add image
            </Button>
          </div>
          {gallery.length === 0 ? (
            <p className="text-xs text-muted-foreground">No gallery images yet.</p>
          ) : (
            <ul className="grid gap-2 sm:grid-cols-2">
              {gallery.map((img) => (
                <li
                  key={img.id}
                  className="flex items-center justify-between gap-2 rounded-lg border border-border px-3 py-2 text-sm"
                >
                  <a
                    href={img.url}
                    target="_blank"
                    rel="noreferrer"
                    className="truncate text-primary underline-offset-2 hover:underline"
                  >
                    {img.url}
                  </a>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={galleryBusy}
                    onClick={() => {
                      if (!token || !eventId) return;
                      setGalleryBusy(true);
                      void removeEventGalleryImage(token, eventId, img.id)
                        .then(async () => {
                          setGallery(await listEventGallery(token, eventId));
                        })
                        .catch((err) => {
                          setSaveError(
                            err instanceof ApiError
                              ? err.message
                              : "Failed to remove image",
                          );
                        })
                        .finally(() => setGalleryBusy(false));
                    }}
                  >
                    Remove
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="grid gap-4 rounded-xl bg-background p-4 ring-1 ring-foreground/10">
          <h2 className="font-heading text-sm font-medium">Date & time</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="startsAt">Starts</Label>
              <Input
                id="startsAt"
                type="datetime-local"
                required
                disabled={readOnly}
                value={startsAt}
                onChange={(e) => setStartsAt(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="endsAt">Ends</Label>
              <Input
                id="endsAt"
                type="datetime-local"
                required
                disabled={readOnly}
                value={endsAt}
                onChange={(e) => setEndsAt(e.target.value)}
              />
            </div>
          </div>
        </section>

        <section className="grid gap-4 rounded-xl bg-background p-4 ring-1 ring-foreground/10">
          <h2 className="font-heading text-sm font-medium">Venue</h2>
          <div className="grid gap-2">
            <Label htmlFor="venueName">Venue name</Label>
            <Input
              id="venueName"
              disabled={readOnly}
              value={venueName}
              onChange={(e) => setVenueName(e.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="venueAddress">Address</Label>
            <Input
              id="venueAddress"
              disabled={readOnly}
              value={venueAddress}
              onChange={(e) => setVenueAddress(e.target.value)}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="venueCity">City</Label>
              <Input
                id="venueCity"
                disabled={readOnly}
                value={venueCity}
                onChange={(e) => setVenueCity(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="venueArea">Area</Label>
              <Input
                id="venueArea"
                disabled={readOnly}
                value={venueArea}
                onChange={(e) => setVenueArea(e.target.value)}
              />
            </div>
          </div>
        </section>

        <section className="grid gap-4 rounded-xl bg-background p-4 ring-1 ring-foreground/10">
          <h2 className="font-heading text-sm font-medium">Event information</h2>
          <div className="grid gap-2">
            <Label htmlFor="dressCode">Dress code</Label>
            <Input
              id="dressCode"
              disabled={readOnly}
              value={dressCode}
              onChange={(e) => setDressCode(e.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="ageRestriction">Age restriction</Label>
            <Input
              id="ageRestriction"
              disabled={readOnly}
              value={ageRestriction}
              onChange={(e) => setAgeRestriction(e.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="rules">Rules</Label>
            <Textarea
              id="rules"
              rows={3}
              disabled={readOnly}
              value={rules}
              onChange={(e) => setRules(e.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="notices">Notices</Label>
            <Textarea
              id="notices"
              rows={3}
              disabled={readOnly}
              value={notices}
              onChange={(e) => setNotices(e.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="contactDetails">Contact details</Label>
            <Textarea
              id="contactDetails"
              rows={2}
              disabled={readOnly}
              value={contactDetails}
              onChange={(e) => setContactDetails(e.target.value)}
            />
          </div>
        </section>

        {!readOnly ? (
          <div>
            <Button type="submit" disabled={saving}>
              {saving ? "Saving…" : "Save event"}
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
          <form onSubmit={onSaveTicket} className="grid gap-3">
            {ticketError ? (
              <Alert variant="destructive">
                <AlertDescription>{ticketError}</AlertDescription>
              </Alert>
            ) : null}
            <div className="grid gap-2">
              <Label htmlFor="tt-name">Name</Label>
              <Input
                id="tt-name"
                required
                value={ticketForm.name}
                onChange={(e) => setTicketForm((s) => ({ ...s, name: e.target.value }))}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="tt-desc">Description</Label>
              <Textarea
                id="tt-desc"
                rows={2}
                value={ticketForm.description}
                onChange={(e) =>
                  setTicketForm((s) => ({ ...s, description: e.target.value }))
                }
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="tt-price">Price (GHS)</Label>
                <Input
                  id="tt-price"
                  required
                  inputMode="decimal"
                  value={ticketForm.price}
                  onChange={(e) => setTicketForm((s) => ({ ...s, price: e.target.value }))}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="tt-qty">Quantity</Label>
                <Input
                  id="tt-qty"
                  type="number"
                  min={0}
                  required
                  value={ticketForm.quantityTotal}
                  onChange={(e) =>
                    setTicketForm((s) => ({ ...s, quantityTotal: e.target.value }))
                  }
                />
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="tt-sales-start">Sales start</Label>
                <Input
                  id="tt-sales-start"
                  type="datetime-local"
                  value={ticketForm.salesStartsAt}
                  onChange={(e) =>
                    setTicketForm((s) => ({ ...s, salesStartsAt: e.target.value }))
                  }
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="tt-sales-end">Sales end</Label>
                <Input
                  id="tt-sales-end"
                  type="datetime-local"
                  value={ticketForm.salesEndsAt}
                  onChange={(e) =>
                    setTicketForm((s) => ({ ...s, salesEndsAt: e.target.value }))
                  }
                />
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={ticketForm.isActive}
                onChange={(e) =>
                  setTicketForm((s) => ({ ...s, isActive: e.target.checked }))
                }
              />
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
              <Button type="submit" disabled={ticketSaving}>
                {ticketSaving ? "Saving…" : "Save ticket type"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </OrganizerShell>
  );
}
