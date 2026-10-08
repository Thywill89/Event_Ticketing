import "dotenv/config";
import { prisma } from "../src/db";

async function main() {
  const rows = await prisma.organizer.findMany({
    include: {
      user: { select: { email: true, fullName: true } },
      _count: { select: { events: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  for (const o of rows) {
    console.log(
      `${o.status.padEnd(10)} events=${String(o._count.events).padStart(2)}  ${o.displayName}  <${o.user.email}>`,
    );
  }
  console.log(`Total: ${rows.length}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
