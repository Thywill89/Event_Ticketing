/**
 * Local smoke: issue ticket via stub → check-in → reject second scan.
 * Run: npx tsx scripts/smoke-check-in.ts
 */
import "dotenv/config";
import { prisma } from "../src/db";
import { hashPassword } from "../src/lib/password";
import { signAccessToken } from "../src/lib/jwt";
import {
  generateQrToken,
  generateTicketNumber,
} from "../src/lib/ticket-codes";

const base = process.env.API_URL ?? "http://localhost:4000";

async function main() {
  const stamp = Date.now();
  const email = `ci-org-${stamp}@example.com`;
  const passwordHash = await hashPassword("Organizer123!");

  const user = await prisma.user.create({
    data: {
      email,
      passwordHash,
      fullName: "CI Org",
      role: "ORGANIZER",
      organizer: {
        create: { displayName: `CI Org ${stamp}`, status: "APPROVED" },
      },
    },
    include: { organizer: true },
  });

  const organizerId = user.organizer!.id;
  const token = signAccessToken({
    sub: user.id,
    email: user.email,
    role: "ORGANIZER",
    organizerId,
  });

  const startsAt = new Date(Date.now() + 7 * 86_400_000);
  const endsAt = new Date(startsAt.getTime() + 4 * 3_600_000);

  const event = await prisma.event.create({
    data: {
      organizerId,
      name: `CI Smoke ${stamp}`,
      slug: `ci-smoke-${stamp}`,
      status: "SALES_OPEN",
      startsAt,
      endsAt,
      ticketTypes: {
        create: {
          name: "General",
          price: 25,
          currency: "GHS",
          quantityTotal: 50,
          isActive: true,
        },
      },
    },
    include: { ticketTypes: true },
  });

  const tt = event.ticketTypes[0]!;

  const orderRes = await fetch(`${base}/events/${event.id}/orders`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      purchaserName: "Guest",
      purchaserEmail: `guest-${stamp}@example.com`,
      purchaserPhone: "+233200000001",
      items: [{ ticketTypeId: tt.id, quantity: 1 }],
    }),
  });
  const orderJson = (await orderRes.json()) as {
    order?: { id: string; accessToken: string; items: Array<{ id: string }> };
    error?: string;
  };
  if (!orderRes.ok || !orderJson.order) {
    throw new Error(`create order failed: ${JSON.stringify(orderJson)}`);
  }
  const order = orderJson.order;

  const payRes = await fetch(
    `${base}/orders/${order.id}/payments/stub-complete`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accessToken: order.accessToken }),
    },
  );
  const payJson = (await payRes.json()) as {
    order?: {
      tickets: Array<{ qrToken: string; ticketNumber: string; status: string }>;
      items: Array<{ id: string }>;
    };
    error?: string;
  };
  if (!payRes.ok || !payJson.order?.tickets?.[0]) {
    throw new Error(`stub pay failed: ${JSON.stringify(payJson)}`);
  }

  const ticket = payJson.order.tickets[0];
  console.log("issued", ticket.ticketNumber, ticket.status);

  const headers = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };

  const ci1 = await fetch(`${base}/events/${event.id}/check-ins`, {
    method: "POST",
    headers,
    body: JSON.stringify({ code: ticket.qrToken, deviceLabel: "smoke" }),
  });
  const ci1Body = (await ci1.json()) as { ok?: boolean; code?: string; message?: string };
  console.log("first", ci1.status, JSON.stringify(ci1Body));
  if (!ci1.ok || !ci1Body.ok) {
    throw new Error("first check-in failed");
  }

  const ci2 = await fetch(`${base}/events/${event.id}/check-ins`, {
    method: "POST",
    headers,
    body: JSON.stringify({ code: ticket.qrToken, deviceLabel: "smoke" }),
  });
  const ci2Body = (await ci2.json()) as { ok?: boolean; code?: string };
  console.log("second", ci2.status, JSON.stringify(ci2Body));
  if (ci2.ok || ci2Body.code !== "TICKET_ALREADY_CHECKED_IN") {
    throw new Error("second check-in should be TICKET_ALREADY_CHECKED_IN");
  }

  const t2 = await prisma.ticket.create({
    data: {
      eventId: event.id,
      orderId: order.id,
      orderItemId: payJson.order.items[0]!.id,
      ticketTypeId: tt.id,
      status: "ISSUED",
      ticketNumber: generateTicketNumber(),
      qrToken: generateQrToken(),
      attendeeName: "Manual",
      issuedAt: new Date(),
    },
  });

  const ci3 = await fetch(`${base}/events/${event.id}/check-ins`, {
    method: "POST",
    headers,
    body: JSON.stringify({ code: t2.ticketNumber }),
  });
  const ci3Body = (await ci3.json()) as { ok?: boolean };
  console.log("byNumber", ci3.status, JSON.stringify(ci3Body));
  if (!ci3.ok || !ci3Body.ok) {
    throw new Error("ticket number check-in failed");
  }

  const statsRes = await fetch(`${base}/events/${event.id}/check-ins/stats`, {
    headers,
  });
  console.log("stats", await statsRes.text());
  console.log("SMOKE PASS");
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
