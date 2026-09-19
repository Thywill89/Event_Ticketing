import type { NotificationChannel, NotificationStatus } from "@event-ticketing/shared";
import { prisma } from "../db";
import { env } from "../config/env";

export type NotifyInput = {
  channel: NotificationChannel;
  recipient: string;
  subject?: string;
  body: string;
  entityType?: string;
  entityId?: string;
};

/**
 * Notification foundation (plan §15.1).
 * Default transport is console/dev logging. Optional SMTP when EMAIL_TRANSPORT=smtp.
 * Records every attempt in the Notification table for later provider swap.
 */
export async function enqueueNotification(
  input: NotifyInput,
): Promise<{ id: string; status: NotificationStatus }> {
  const row = await prisma.notification.create({
    data: {
      channel: input.channel,
      recipient: input.recipient,
      subject: input.subject ?? null,
      body: input.body,
      entityType: input.entityType ?? null,
      entityId: input.entityId ?? null,
      status: "PENDING",
    },
  });

  try {
    if (input.channel === "EMAIL") {
      await deliverEmail({
        to: input.recipient,
        subject: input.subject ?? "EventTicketing",
        body: input.body,
      });
    } else {
      console.info(
        `[notify:${input.channel}] ${input.recipient} — ${input.subject ?? "(no subject)"}`,
      );
      console.info(input.body);
    }

    const updated = await prisma.notification.update({
      where: { id: row.id },
      data: { status: "SENT", sentAt: new Date(), error: null },
    });
    return { id: updated.id, status: updated.status };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Delivery failed";
    const updated = await prisma.notification.update({
      where: { id: row.id },
      data: { status: "FAILED", error: message },
    });
    console.error(`[notify] failed ${row.id}:`, message);
    return { id: updated.id, status: updated.status };
  }
}

async function deliverEmail(input: {
  to: string;
  subject: string;
  body: string;
}): Promise<void> {
  if (env.emailTransport === "smtp") {
    // SMTP wiring is intentionally stubbed until credentials are provided.
    // When ready: use nodemailer (or similar) with EMAIL_SMTP_* env vars.
    if (!env.emailSmtpHost || !env.emailFrom) {
      throw new Error(
        "EMAIL_TRANSPORT=smtp requires EMAIL_SMTP_HOST and EMAIL_FROM",
      );
    }
    console.warn(
      "[notify:email] SMTP transport selected but nodemailer is not wired yet — logging instead",
    );
  }

  console.info("────────────────────────────────────────");
  console.info(`[email:${env.emailTransport}] To: ${input.to}`);
  console.info(`Subject: ${input.subject}`);
  console.info(input.body);
  console.info("────────────────────────────────────────");
}

export async function notifyOrderConfirmation(order: {
  id: string;
  purchaserEmail: string;
  purchaserName: string;
  eventName: string;
  eventSlug: string;
  totalAmount: string;
  currency: string;
  accessToken: string;
  tickets: Array<{ ticketNumber: string; ticketTypeName: string }>;
}): Promise<void> {
  const ticketLines = order.tickets
    .map((t) => `  • ${t.ticketTypeName}: ${t.ticketNumber}`)
    .join("\n");

  const confirmBase = env.publicWebUrl || "";
  const confirmPath = `/orders/${order.id}?accessToken=${encodeURIComponent(order.accessToken)}`;
  const confirmUrl = confirmBase ? `${confirmBase}${confirmPath}` : confirmPath;
  const body = [
    `Hi ${order.purchaserName},`,
    "",
    `Your tickets for "${order.eventName}" are ready.`,
    `Total paid: ${order.currency} ${order.totalAmount}`,
    "",
    "Tickets:",
    ticketLines || "  (see confirmation page)",
    "",
    `Open your confirmation: ${confirmUrl}`,
    "Bring the QR code (or ticket number) to the door.",
    "",
    "— EventTicketing",
  ].join("\n");

  await enqueueNotification({
    channel: "EMAIL",
    recipient: order.purchaserEmail,
    subject: `Tickets confirmed — ${order.eventName}`,
    body,
    entityType: "Order",
    entityId: order.id,
  });
}

export async function notifyEventLifecycle(input: {
  eventId: string;
  eventName: string;
  status: "CANCELLED" | "POSTPONED";
  recipients: Array<{ email: string; name: string }>;
}): Promise<void> {
  const verb = input.status === "CANCELLED" ? "cancelled" : "postponed";
  for (const r of input.recipients) {
    await enqueueNotification({
      channel: "EMAIL",
      recipient: r.email,
      subject: `Event ${verb}: ${input.eventName}`,
      body: [
        `Hi ${r.name},`,
        "",
        `The event "${input.eventName}" has been ${verb}.`,
        "If you purchased tickets, the organizer/platform will follow up about next steps.",
        "",
        "— EventTicketing",
      ].join("\n"),
      entityType: "Event",
      entityId: input.eventId,
    });
  }
}
