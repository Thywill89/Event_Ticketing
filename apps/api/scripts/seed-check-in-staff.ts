/**
 * Upsert a CHECK_IN_STAFF user, link them under an organizer, and assign to an event.
 *
 * Usage (from apps/api):
 *   npx tsx scripts/seed-check-in-staff.ts --eventId=<cuid>
 *
 * Optional env:
 *   STAFF_EMAIL=door@example.com
 *   STAFF_PASSWORD=Staff123!
 *   STAFF_FULL_NAME=Door Staff
 *   EVENT_ID=<cuid>   (alternative to --eventId)
 */
import "dotenv/config";
import { prisma } from "../src/db";
import { hashPassword } from "../src/lib/password";

function readArg(name: string): string | undefined {
  const prefix = `--${name}=`;
  const hit = process.argv.find((a) => a.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : undefined;
}

async function main() {
  const eventId =
    readArg("eventId") ?? process.env.EVENT_ID ?? "";
  const email = (process.env.STAFF_EMAIL ?? "door@example.com").toLowerCase();
  const password = process.env.STAFF_PASSWORD ?? "Staff123!";
  const fullName = process.env.STAFF_FULL_NAME ?? "Door Staff";

  if (!eventId.trim()) {
    throw new Error("Pass --eventId=<id> or set EVENT_ID");
  }
  if (password.length < 8) {
    throw new Error("STAFF_PASSWORD must be at least 8 characters");
  }

  const event = await prisma.event.findUnique({
    where: { id: eventId },
    select: { id: true, name: true, organizerId: true },
  });
  if (!event) {
    throw new Error(`Event not found: ${eventId}`);
  }

  const passwordHash = await hashPassword(password);

  const user = await prisma.user.upsert({
    where: { email },
    create: {
      email,
      passwordHash,
      fullName,
      role: "CHECK_IN_STAFF",
      isActive: true,
    },
    update: {
      passwordHash,
      fullName,
      role: "CHECK_IN_STAFF",
      isActive: true,
    },
  });

  const staff = await prisma.organizerStaff.upsert({
    where: {
      organizerId_userId: {
        organizerId: event.organizerId,
        userId: user.id,
      },
    },
    create: {
      organizerId: event.organizerId,
      userId: user.id,
      isActive: true,
    },
    update: { isActive: true },
  });

  await prisma.eventStaffAssignment.upsert({
    where: {
      staffId_eventId: {
        staffId: staff.id,
        eventId: event.id,
      },
    },
    create: {
      staffId: staff.id,
      eventId: event.id,
    },
    update: {},
  });

  console.log("Check-in staff ready:");
  console.log(`  userId:  ${user.id}`);
  console.log(`  email:   ${user.email}`);
  console.log(`  event:   ${event.name} (${event.id})`);
  console.log(`  password: (from STAFF_PASSWORD or default Staff123!)`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
