"use client";

import { useCallback, useEffect, useState } from "react";
import type { AdminOrderSummaryDto, OrderStatus } from "@event-ticketing/shared";
import { AdminShell } from "@/components/admin-shell";
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
import { ApiError, listAdminOrders } from "@/lib/api";
import { useAuth } from "@/lib/auth";

export default function AdminOrdersPage() {
  const { token } = useAuth();
  const [orders, setOrders] = useState<AdminOrderSummaryDto[]>([]);
  const [status, setStatus] = useState<OrderStatus | "ALL">("PAID");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      setOrders(
        await listAdminOrders(token, {
          status: status === "ALL" ? undefined : status,
          limit: 100,
        }),
      );
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load orders");
    } finally {
      setLoading(false);
    }
  }, [token, status]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <AdminShell
      title="Orders"
      description="Inspect ticket purchases and payment status across the platform."
      actions={
        <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
          Refresh
        </Button>
      }
    >
      <div className="mb-4 flex flex-wrap gap-2">
        {(["PAID", "RESERVED", "CANCELLED", "ALL"] as const).map((f) => (
          <Button
            key={f}
            size="sm"
            variant={status === f ? "default" : "outline"}
            onClick={() => setStatus(f)}
          >
            {f === "ALL" ? "All" : f}
          </Button>
        ))}
      </div>

      {error ? (
        <Alert variant="destructive" className="mb-4">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : orders.length === 0 ? (
        <p className="text-sm text-muted-foreground">No orders in this filter.</p>
      ) : (
        <div className="overflow-hidden rounded-xl bg-background ring-1 ring-foreground/10">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Event</TableHead>
                <TableHead>Purchaser</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Payment</TableHead>
                <TableHead>Total</TableHead>
                <TableHead>When</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {orders.map((o) => (
                <TableRow key={o.id}>
                  <TableCell className="font-medium">{o.eventName}</TableCell>
                  <TableCell>
                    <div>{o.purchaserName}</div>
                    <div className="text-xs text-muted-foreground">
                      {o.purchaserEmail}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary">{o.status}</Badge>
                  </TableCell>
                  <TableCell>
                    {o.paymentStatus ?? "—"}
                    {o.paymentProvider ? ` (${o.paymentProvider})` : ""}
                  </TableCell>
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
    </AdminShell>
  );
}
