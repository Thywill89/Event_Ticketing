/**
 * Local smoke: seed a paid ticket via Prisma → check-in → reject second scan.
 * Run: npx tsx scripts/smoke-check-in.ts
 */
import "dotenv/config";
import { prisma } from "../src/db";
import { hashPassword } from "../src/lib/password";
import { signAccessToken } from "../src/lib/jwt";
import {
  generateOrderAccessToken,
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
          quantitySold: 1,
          isActive: true,
        },
      },
    },
    include: { ticketTypes: true },
  });

  const tt = event.ticketTypes[0]!;
  const accessToken = generateOrderAccessToken();
  const ticketNumber = generateTicketNumber();
  const qrToken = generateQrToken();

  const order = await prisma.order.create({
    data: {
      eventId: event.id,
      status: "PAID",
      purchaserName: "Guest",
      purchaserEmail: `guest-${stamp}@example.com`,
      purchaserPhone: "+233200000001",
      currency: "GHS",
      subtotalAmount: 25,
      totalAmount: 25,
      accessToken,
      items: {
        create: {
          ticketTypeId: tt.id,
          quantity: 1,
          unitPrice: 25,
          lineTotal: 25,
        },
      },
      payment: {
        create: {
          status: "SUCCEEDED",
          provider: "paystack",
          providerRef: `smoke_${stamp}`,
          amount: 25,
          currency: "GHS",
          paidAt: new Date(),
        },
      },
    },
    include: { items: true },
  });

  const orderItemId = order.items[0]!.id;

  const ticket = await prisma.ticket.create({
    data: {
      eventId: event.id,
      orderId: order.id,
      orderItemId,
      ticketTypeId: tt.id,
      status: "ISSUED",
      ticketNumber,
      qrToken,
      attendeeName: "Guest",
      issuedAt: new Date(),
    },
  });

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
  const ci1Body = (await ci1.json()) as {
    ok?: boolean;
    code?: string;
    message?: string;
  };
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
      orderItemId,
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
