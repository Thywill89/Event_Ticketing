/**
 * Remove leftover CI/smoke organizer accounts. Keeps ORGANIZER_EMAIL
 * (default organizer@example.com).
 *
 * Usage: npx tsx scripts/cleanup-smoke-organizers.ts
 */
import "dotenv/config";
import { prisma } from "../src/db";

const KEEP_EMAIL = (
  process.env.ORGANIZER_EMAIL ?? "organizer@example.com"
).toLowerCase();

function isSmokeOrganizer(email: string, displayName: string): boolean {
  const e = email.toLowerCase();
  const d = displayName.toLowerCase();
  return (
    e.includes("smoke") ||
    e.startsWith("org-wf-") ||
    e.startsWith("org-order-") ||
    e.startsWith("org-checkin-") ||
    e.startsWith("ci-org-") ||
    e.startsWith("organizer.smoke.") ||
    d.includes("smoke") ||
    d.startsWith("wf org") ||
    d.startsWith("order org") ||
    d.startsWith("checkin org") ||
    d.startsWith("ci org") ||
    d === "other org"
  );
}

async function hardDeleteOrganizer(organizerId: string, userId: string) {
  const events = await prisma.event.findMany({
    where: { organizerId },
    select: { id: true },
  });

  for (const event of events) {
    await prisma.checkIn.deleteMany({ where: { eventId: event.id } });
    await prisma.ticket.deleteMany({ where: { eventId: event.id } });
    await prisma.order.deleteMany({ where: { eventId: event.id } });
    await prisma.eventStaffAssignment.deleteMany({
      where: { eventId: event.id },
    });
    await prisma.eventGalleryImage.deleteMany({ where: { eventId: event.id } });
    await prisma.ticketType.deleteMany({ where: { eventId: event.id } });
    await prisma.event.delete({ where: { id: event.id } });
  }

  await prisma.organizerStaff.deleteMany({ where: { organizerId } });
  // Cascades organizer → user via organizer.userId? Organizer has onDelete Cascade from User,
  // so deleting the user removes the organizer. Delete organizer first then user if needed.
  await prisma.organizer.delete({ where: { id: organizerId } });
  await prisma.refreshToken.deleteMany({ where: { userId } });
  await prisma.user.delete({ where: { id: userId } });
}

async function main() {
  const rows = await prisma.organizer.findMany({
    include: {
      user: { select: { id: true, email: true } },
      _count: { select: { events: true } },
    },
  });

  const victims = rows.filter(
    (o) =>
      o.user.email.toLowerCase() !== KEEP_EMAIL &&
      isSmokeOrganizer(o.user.email, o.displayName),
  );

  console.log(`Keeping ${KEEP_EMAIL}`);
  console.log(`Deleting ${victims.length} smoke organizer(s)…`);

  for (const o of victims) {
    console.log(
      `  - ${o.displayName} <${o.user.email}> (${o._count.events} events)`,
    );
    await hardDeleteOrganizer(o.id, o.user.id);
  }

  const remaining = await prisma.organizer.count();
  console.log(`Done. Organizers left: ${remaining}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
