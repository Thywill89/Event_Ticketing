"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import type { OrganizerOrderSummaryDto } from "@event-ticketing/shared";
import { OrganizerShell } from "@/components/organizer-shell";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ApiError, listOrganizerEventOrders } from "@/lib/api";
import { useAuth } from "@/lib/auth";

export default function EventOrdersPage() {
  const params = useParams<{ id: string }>();
  const eventId = params.id;
  const { token } = useAuth();
  const [orders, setOrders] = useState<OrganizerOrderSummaryDto[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!token || !eventId) return;
    setLoading(true);
    setError(null);
    try {
      setOrders(await listOrganizerEventOrders(token, eventId));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load orders");
    } finally {
      setLoading(false);
    }
  }, [token, eventId]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <OrganizerShell
      title="Sales / orders"
      actions={
        <Button
          variant="outline"
          render={<Link href={`/organizer/events/${eventId}`} />}
        >
          Back to event
        </Button>
      }
    >
      {error ? (
        <Alert variant="destructive" className="mb-4">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : orders.length === 0 ? (
        <p className="text-sm text-muted-foreground">No orders yet.</p>
      ) : (
        <div className="overflow-hidden rounded-xl bg-background ring-1 ring-foreground/10">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Purchaser</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Payment</TableHead>
                <TableHead>Tickets</TableHead>
                <TableHead>Total</TableHead>
                <TableHead>When</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {orders.map((o) => (
                <TableRow key={o.id}>
                  <TableCell>
                    <div className="font-medium">{o.purchaserName}</div>
                    <div className="text-xs text-muted-foreground">
                      {o.purchaserEmail}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary">{o.status}</Badge>
                  </TableCell>
                  <TableCell>{o.paymentStatus ?? "—"}</TableCell>
                  <TableCell>{o.ticketCount}</TableCell>
                  <TableCell>
                    {o.currency} {o.totalAmount}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {new Date(o.createdAt).toLocaleString()}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </OrganizerShell>
  );
}
