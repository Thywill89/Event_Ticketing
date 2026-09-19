/**
 * Upsert a local PLATFORM_ADMIN user for event review testing.
 *
 * Usage (from apps/api):
 *   npx tsx scripts/seed-admin.ts
 *
 * Optional env:
 *   ADMIN_EMAIL=admin@example.com
 *   ADMIN_PASSWORD=Admin123!
 *   ADMIN_FULL_NAME=Platform Admin
 */
import "dotenv/config";
import { prisma } from "../src/db";
import { hashPassword } from "../src/lib/password";

async function main() {
  const email = (process.env.ADMIN_EMAIL ?? "admin@example.com").toLowerCase();
  const password = process.env.ADMIN_PASSWORD ?? "Admin123!";
  const fullName = process.env.ADMIN_FULL_NAME ?? "Platform Admin";

  if (password.length < 8) {
    throw new Error("ADMIN_PASSWORD must be at least 8 characters");
  }

  const passwordHash = await hashPassword(password);

  const user = await prisma.user.upsert({
    where: { email },
    create: {
      email,
      passwordHash,
      fullName,
      role: "PLATFORM_ADMIN",
      isActive: true,
    },
    update: {
      passwordHash,
      fullName,
      role: "PLATFORM_ADMIN",
      isActive: true,
    },
  });

  console.log("Platform admin ready:");
  console.log(`  id:    ${user.id}`);
  console.log(`  email: ${user.email}`);
  console.log(`  role:  ${user.role}`);
  console.log(`  password: (from ADMIN_PASSWORD or default Admin123!)`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
