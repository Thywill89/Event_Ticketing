/**
 * Upsert a local ORGANIZER user (APPROVED) for workspace testing.
 *
 * Usage (from apps/api):
 *   npx tsx scripts/seed-organizer.ts
 *
 * Optional env:
 *   ORGANIZER_EMAIL=organizer@example.com
 *   ORGANIZER_PASSWORD=Organizer123!
 *   ORGANIZER_FULL_NAME=Demo Organizer
 *   ORGANIZER_DISPLAY_NAME=Demo Events Co
 */
import "dotenv/config";
import { prisma } from "../src/db";
import { hashPassword } from "../src/lib/password";

async function main() {
  const email = (process.env.ORGANIZER_EMAIL ?? "organizer@example.com").toLowerCase();
  const password = process.env.ORGANIZER_PASSWORD ?? "Organizer123!";
  const fullName = process.env.ORGANIZER_FULL_NAME ?? "Demo Organizer";
  const displayName = process.env.ORGANIZER_DISPLAY_NAME ?? "Demo Events Co";

  if (password.length < 8) {
    throw new Error("ORGANIZER_PASSWORD must be at least 8 characters");
  }

  const passwordHash = await hashPassword(password);

  const user = await prisma.user.upsert({
    where: { email },
    create: {
      email,
      passwordHash,
      fullName,
      role: "ORGANIZER",
      isActive: true,
    },
    update: {
      passwordHash,
      fullName,
      role: "ORGANIZER",
      isActive: true,
    },
  });

  const organizer = await prisma.organizer.upsert({
    where: { userId: user.id },
    create: {
      userId: user.id,
      displayName,
      status: "APPROVED",
    },
    update: {
      displayName,
      status: "APPROVED",
    },
  });

  console.log("Organizer ready:");
  console.log(`  user id:      ${user.id}`);
  console.log(`  organizer id: ${organizer.id}`);
  console.log(`  email:        ${email}`);
  console.log(`  password:     ${password}`);
  console.log(`  displayName:  ${displayName}`);
  console.log(`  status:       ${organizer.status}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
