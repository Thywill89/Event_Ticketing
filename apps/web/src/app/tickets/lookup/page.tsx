"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import type { TicketLookupResultDto } from "@event-ticketing/shared";
import { PublicShell } from "@/components/site-header";
import { TicketQrImage } from "@/components/ticket-qr-image";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError, lookupTicket } from "@/lib/api";

export default function TicketLookupPage() {
  const [email, setEmail] = useState("");
  const [ticketNumber, setTicketNumber] = useState("");
  const [result, setResult] = useState<TicketLookupResultDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      setResult(await lookupTicket({ email, ticketNumber }));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Lookup failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <PublicShell>
      <div className="mb-6 space-y-2">
        <h1 className="font-heading text-3xl font-semibold tracking-tight">
          Find your ticket
        </h1>
        <p className="text-muted-foreground">
          Lost the confirmation email? Enter the email used at checkout and your
          ticket number.
        </p>
      </div>

      <form
        onSubmit={onSubmit}
        className="mb-8 grid max-w-md gap-4 rounded-xl bg-background p-4 ring-1 ring-foreground/10"
      >
        {error ? (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
        <div className="grid gap-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="ticketNumber">Ticket number</Label>
          <Input
            id="ticketNumber"
            required
            placeholder="EVT-…"
            value={ticketNumber}
            onChange={(e) => setTicketNumber(e.target.value)}
          />
        </div>
        <Button type="submit" disabled={busy}>
          {busy ? "Looking up…" : "Recover ticket"}
        </Button>
      </form>

      {result ? (
        <div className="max-w-md space-y-4 rounded-xl bg-background p-4 ring-1 ring-foreground/10">
          <div className="flex items-center gap-2">
            <h2 className="font-heading text-lg font-semibold">{result.eventName}</h2>
            <Badge variant="secondary">{result.status}</Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            {result.ticketTypeName} · {result.ticketNumber}
            {result.venueName ? ` · ${result.venueName}` : ""}
          </p>
          <TicketQrImage value={result.qrToken} />
          <Button
            render={
              <Link
                href={`/orders/${result.orderId}?accessToken=${encodeURIComponent(result.accessToken)}`}
              />
            }
          >
            Open full order
          </Button>
        </div>
      ) : null}
    </PublicShell>
  );
}
