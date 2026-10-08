import "dotenv/config";
import { prisma } from "../src/db";

async function main() {
  const n = await prisma.organizer.count();
  console.log(`ok organizers=${n}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
