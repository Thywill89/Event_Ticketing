import type { NotificationChannel, NotificationStatus } from "@event-me/shared";
import nodemailer from "nodemailer";
import type { Transporter } from "nodemailer";
import QRCode from "qrcode";
import { prisma } from "../db";
import { env } from "../config/env";

export type EmailAttachment = {
  filename: string;
  content: Buffer;
  contentType: string;
  /** Referenced from the HTML as `cid:<cid>`. */
  cid?: string;
};

export type NotifyInput = {
  channel: NotificationChannel;
  recipient: string;
  subject?: string;
  /** Plain-text body; this is what gets stored on the Notification row. */
  body: string;
  /** Email only — delivered alongside the text body, not persisted. */
  html?: string;
  attachments?: EmailAttachment[];
  entityType?: string;
  entityId?: string;
};

let smtpTransporter: Transporter | null = null;

function getSmtpTransporter(): Transporter {
  if (smtpTransporter) return smtpTransporter;

  if (!env.emailSmtpHost || !env.emailFrom) {
    throw new Error(
      "EMAIL_TRANSPORT=smtp requires EMAIL_SMTP_HOST and EMAIL_FROM",
    );
  }

  smtpTransporter = nodemailer.createTransport({
    host: env.emailSmtpHost,
    port: env.emailSmtpPort,
    secure: env.emailSmtpPort === 465,
    auth:
      env.emailSmtpUser || env.emailSmtpPass
        ? {
            user: env.emailSmtpUser,
            pass: env.emailSmtpPass,
          }
        : undefined,
  });

  return smtpTransporter;
}

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
        subject: input.subject ?? "EventMe",
        body: input.body,
        html: input.html,
        attachments: input.attachments,
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
  html?: string;
  attachments?: EmailAttachment[];
}): Promise<void> {
  if (env.emailTransport === "smtp") {
    const transporter = getSmtpTransporter();
    await transporter.sendMail({
      from: env.emailFrom,
      to: input.to,
      subject: input.subject,
      text: input.body,
      html: input.html,
      attachments: input.attachments,
    });
    console.info(`[email:smtp] sent to ${input.to}: ${input.subject}`);
    return;
  }

  console.info("────────────────────────────────────────");
  console.info(`[email:console] To: ${input.to}`);
  console.info(`Subject: ${input.subject}`);
  console.info(input.body);
  if (input.attachments?.length) {
    console.info(`(+ ${input.attachments.length} attachment(s), HTML version included)`);
  }
  console.info("────────────────────────────────────────");
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
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
  tickets: Array<{ ticketNumber: string; ticketTypeName: string; qrToken: string }>;
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
    "— EventMe",
  ].join("\n");

  // Gmail and most clients strip data: URIs, so QR images go in as inline CID attachments.
  const attachments: EmailAttachment[] = await Promise.all(
    order.tickets.map(async (t, i) => ({
      filename: `${t.ticketNumber}.png`,
      content: await QRCode.toBuffer(t.qrToken, { type: "png", width: 240, margin: 2 }),
      contentType: "image/png",
      cid: `ticket-qr-${i}@eventme`,
    })),
  );

  const ticketBlocks = order.tickets
    .map(
      (t, i) => `
        <tr>
          <td style="padding:16px;border:1px solid #e5e5e5;border-radius:12px;">
            <table role="presentation" cellpadding="0" cellspacing="0"><tr>
              <td style="padding-right:16px;vertical-align:top;">
                <img src="cid:ticket-qr-${i}@eventme" width="160" height="160" alt="QR code for ${escapeHtml(t.ticketNumber)}" style="display:block;" />
              </td>
              <td style="vertical-align:top;font-size:14px;color:#111;">
                <div style="font-weight:600;">${escapeHtml(t.ticketTypeName)}</div>
                <div style="margin-top:4px;">Ticket number: <span style="font-family:monospace;">${escapeHtml(t.ticketNumber)}</span></div>
              </td>
            </tr></table>
          </td>
        </tr>
        <tr><td style="height:12px;"></td></tr>`,
    )
    .join("");

  const html = `<!doctype html>
<html><body style="margin:0;padding:24px;background:#f6f6f6;font-family:Arial,Helvetica,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#fff;border-radius:12px;padding:24px;">
    <tr><td style="font-size:14px;color:#111;line-height:1.5;">
      <p style="margin:0 0 12px;">Hi ${escapeHtml(order.purchaserName)},</p>
      <p style="margin:0 0 4px;">Your tickets for <strong>${escapeHtml(order.eventName)}</strong> are ready.</p>
      <p style="margin:0 0 20px;color:#555;">Total paid: ${escapeHtml(order.currency)} ${escapeHtml(order.totalAmount)}</p>
    </td></tr>
    ${ticketBlocks}
    <tr><td style="font-size:13px;color:#555;line-height:1.5;">
      <p style="margin:8px 0;">Show the QR code (or ticket number) at the entrance. Don't share it — anyone with it can use your ticket.</p>
      <p style="margin:8px 0;">Can't see the QR codes? <a href="${escapeHtml(confirmUrl)}" style="color:#2563eb;">Open your confirmation page</a>.</p>
      <p style="margin:16px 0 0;">— EventMe</p>
    </td></tr>
  </table>
</body></html>`;

  await enqueueNotification({
    channel: "EMAIL",
    recipient: order.purchaserEmail,
    subject: `Tickets confirmed — ${order.eventName}`,
    body,
    html,
    attachments,
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
        "— EventMe",
      ].join("\n"),
      entityType: "Event",
      entityId: input.eventId,
    });
  }
}
