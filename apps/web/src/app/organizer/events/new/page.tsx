"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import type { CreateEventRequest } from "@event-ticketing/shared";
import { OrganizerShell } from "@/components/organizer-shell";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ApiError, createOrganizerEvent } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { fromDatetimeLocalValue } from "@/lib/datetime";

export default function NewEventPage() {
  const { token } = useAuth();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [description, setDescription] = useState("");
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

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!token) return;
    setError(null);
    setSubmitting(true);

    const body: CreateEventRequest = {
      name: name.trim(),
      category: category.trim() || null,
      description: description.trim() || null,
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
    }

    try {
      const event = await createOrganizerEvent(token, body);
      router.push(`/organizer/events/${event.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to create event");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <OrganizerShell
      title="New draft event"
      description="Start with the basics — you can add tickets and submit for review after saving."
      actions={
        <Button variant="outline" render={<Link href="/organizer/events" />}>
          Back to list
        </Button>
      }
    >
      <form onSubmit={onSubmit} className="grid max-w-2xl gap-6">
        {error ? (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        <section className="grid gap-4 rounded-xl bg-background p-4 ring-1 ring-foreground/10">
          <h2 className="font-heading text-sm font-medium">Basic information</h2>
          <div className="grid gap-2">
            <Label htmlFor="name">Event name</Label>
            <Input id="name" required value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="category">Category</Label>
            <Input
              id="category"
              placeholder="Concert, party, wedding…"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              rows={4}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
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
                value={endsAt}
                onChange={(e) => setEndsAt(e.target.value)}
              />
            </div>
          </div>
        </section>

        <section className="grid gap-4 rounded-xl bg-background p-4 ring-1 ring-foreground/10">
          <h2 className="font-heading text-sm font-medium">Venue (optional)</h2>
          <div className="grid gap-2">
            <Label htmlFor="venueName">Venue name</Label>
            <Input
              id="venueName"
              value={venueName}
              onChange={(e) => setVenueName(e.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="venueAddress">Address</Label>
            <Input
              id="venueAddress"
              value={venueAddress}
              onChange={(e) => setVenueAddress(e.target.value)}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="venueCity">City</Label>
              <Input
                id="venueCity"
                value={venueCity}
                onChange={(e) => setVenueCity(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="venueArea">Area</Label>
              <Input
                id="venueArea"
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
              value={dressCode}
              onChange={(e) => setDressCode(e.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="ageRestriction">Age restriction</Label>
            <Input
              id="ageRestriction"
              value={ageRestriction}
              onChange={(e) => setAgeRestriction(e.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="rules">Rules</Label>
            <Textarea id="rules" rows={3} value={rules} onChange={(e) => setRules(e.target.value)} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="notices">Notices</Label>
            <Textarea
              id="notices"
              rows={3}
              value={notices}
              onChange={(e) => setNotices(e.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="contactDetails">Contact details</Label>
            <Textarea
              id="contactDetails"
              rows={2}
              value={contactDetails}
              onChange={(e) => setContactDetails(e.target.value)}
            />
          </div>
        </section>

        <div className="flex gap-2">
          <Button type="submit" disabled={submitting}>
            {submitting ? "Saving…" : "Create draft"}
          </Button>
          <Button variant="outline" render={<Link href="/organizer/events" />}>
            Cancel
          </Button>
        </div>
      </form>
    </OrganizerShell>
  );
}
