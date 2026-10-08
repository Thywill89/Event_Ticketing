/**
 * Replace smoke/test public events with demo Ghana events (cover URLs + tickets).
 *
 * Usage (from apps/api):
 *   npx tsx scripts/seed-ghana-events.ts
 *
 * Uses the demo organizer from ORGANIZER_EMAIL (default organizer@example.com).
 */
import "dotenv/config";
import { randomBytes } from "node:crypto";
import { prisma } from "../src/db";
import { slugify } from "../src/lib/slug";

type SeedEvent = {
  name: string;
  category: string;
  description: string;
  mainImageUrl: string;
  startsInDays: number;
  durationHours: number;
  venue: {
    name: string;
    address: string;
    city: string;
    area: string;
    country: string;
  };
  tickets: Array<{ name: string; price: string; quantityTotal: number }>;
};

const GHANA_EVENTS: SeedEvent[] = [
  {
    name: "Accra Afrobeat Nights",
    category: "Music",
    description:
      "An evening of live Afrobeat, highlife, and dancefloor sets with Ghana’s rising acts. Gates open at 7pm — come ready to move.",
    mainImageUrl:
      "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?auto=format&fit=crop&w=1600&q=80",
    startsInDays: 14,
    durationHours: 5,
    venue: {
      name: "National Theatre of Ghana",
      address: "Liberation Road",
      city: "Accra",
      area: "Victoriaborg",
      country: "Ghana",
    },
    tickets: [
      { name: "Early Bird", price: "80.00", quantityTotal: 200 },
      { name: "Regular", price: "120.00", quantityTotal: 500 },
      { name: "VIP", price: "250.00", quantityTotal: 80 },
    ],
  },
  {
    name: "Labadi Sunset Sessions",
    category: "Lifestyle",
    description:
      "Beachside DJ sets, food vendors, and golden-hour vibes at Labadi. Soft drinks and mocktails welcome — 18+ at the bar.",
    mainImageUrl:
      "https://images.unsplash.com/photo-1429962714451-bb934ecdc4ec?auto=format&fit=crop&w=1600&q=80",
    startsInDays: 21,
    durationHours: 6,
    venue: {
      name: "Labadi Beach Hotel Lawn",
      address: "Labadi Beach Road",
      city: "Accra",
      area: "La",
      country: "Ghana",
    },
    tickets: [
      { name: "General", price: "60.00", quantityTotal: 400 },
      { name: "Lounge", price: "150.00", quantityTotal: 100 },
    ],
  },
  {
    name: "Kumasi Highlife Revival",
    category: "Music",
    description:
      "A celebration of Ashanti highlife legends and new voices. Bring the whole crew — family-friendly until 9pm, then dance sets.",
    mainImageUrl:
      "https://images.unsplash.com/photo-1470229722913-7c0e2dbbafd3?auto=format&fit=crop&w=1600&q=80",
    startsInDays: 28,
    durationHours: 4,
    venue: {
      name: "Centre for National Culture",
      address: "Bantama High Street",
      city: "Kumasi",
      area: "Bantama",
      country: "Ghana",
    },
    tickets: [
      { name: "Standard", price: "50.00", quantityTotal: 350 },
      { name: "Front Row", price: "100.00", quantityTotal: 120 },
    ],
  },
  {
    name: "Cape Coast Heritage Night",
    category: "Culture",
    description:
      "Storytelling, live percussion, and a lantern walk through Cape Coast’s historic quarter. A night for locals and visitors alike.",
    mainImageUrl:
      "https://images.unsplash.com/photo-1533174072545-7a4b6ad7a6c3?auto=format&fit=crop&w=1600&q=80",
    startsInDays: 35,
    durationHours: 3,
    venue: {
      name: "Cape Coast Castle Courtyard",
      address: "Victoria Park Road",
      city: "Cape Coast",
      area: "Castle Area",
      country: "Ghana",
    },
    tickets: [
      { name: "Admission", price: "40.00", quantityTotal: 250 },
      { name: "Guided + Show", price: "75.00", quantityTotal: 100 },
    ],
  },
  {
    name: "Detty December Warm-Up — Accra",
    category: "Festival",
    description:
      "The unofficial kickoff to Detty December: open-air stages, Ghanaian street food, and nonstop Afrobeats until late.",
    mainImageUrl:
      "https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?auto=format&fit=crop&w=1600&q=80",
    startsInDays: 45,
    durationHours: 8,
    venue: {
      name: "Independence Square Grounds",
      address: "28th February Road",
      city: "Accra",
      area: "Osu",
      country: "Ghana",
    },
    tickets: [
      { name: "Day Pass", price: "100.00", quantityTotal: 2000 },
      { name: "VIP Pavilion", price: "350.00", quantityTotal: 200 },
    ],
  },
];

async function uniqueSlug(name: string): Promise<string> {
  const base = slugify(name);
  for (let i = 0; i < 8; i++) {
    const candidate =
      i === 0 ? base : `${base}-${randomBytes(2).toString("hex")}`;
    const existing = await prisma.event.findUnique({
      where: { slug: candidate },
      select: { id: true },
    });
    if (!existing) return candidate;
  }
  return `${base}-${randomBytes(4).toString("hex")}`;
}

async function hardDeleteEvent(eventId: string) {
  // Sequential deletes — avoid interactive $transaction through PgBouncer.
  await prisma.checkIn.deleteMany({ where: { eventId } });
  await prisma.ticket.deleteMany({ where: { eventId } });
  await prisma.order.deleteMany({ where: { eventId } });
  await prisma.eventStaffAssignment.deleteMany({ where: { eventId } });
  await prisma.eventGalleryImage.deleteMany({ where: { eventId } });
  await prisma.ticketType.deleteMany({ where: { eventId } });
  await prisma.event.delete({ where: { id: eventId } });
}

async function main() {
  const email = (
    process.env.ORGANIZER_EMAIL ?? "organizer@example.com"
  ).toLowerCase();

  const user = await prisma.user.findUnique({
    where: { email },
    include: { organizer: true },
  });
  if (!user?.organizer) {
    throw new Error(
      `Organizer not found for ${email}. Run: npm run db:seed-organizer -w @event-me/api`,
    );
  }

  const organizerId = user.organizer.id;

  const smoke = await prisma.event.findMany({
    where: {
      OR: [
        { name: { contains: "Smoke", mode: "insensitive" } },
        { name: { contains: "Workflow", mode: "insensitive" } },
        { organizer: { displayName: { contains: "Smoke", mode: "insensitive" } } },
        { organizer: { displayName: { contains: "CI Org", mode: "insensitive" } } },
        { organizer: { displayName: { contains: "WF Org", mode: "insensitive" } } },
        { organizer: { displayName: { contains: "Order Org", mode: "insensitive" } } },
        { organizer: { displayName: { contains: "CheckIn Org", mode: "insensitive" } } },
      ],
    },
    select: { id: true, name: true, slug: true },
  });

  console.log(`Deleting ${smoke.length} smoke/test event(s)…`);
  for (const row of smoke) {
    console.log(`  - ${row.name}`);
    await hardDeleteEvent(row.id);
  }

  await prisma.organizer.update({
    where: { id: organizerId },
    data: {
      status: "APPROVED",
      displayName: "EventMe Ghana",
    },
  });

  const organizer = await prisma.organizer.findUniqueOrThrow({
    where: { id: organizerId },
  });

  console.log(`Seeding ${GHANA_EVENTS.length} Ghana events for ${organizer.displayName}…`);

  for (const seed of GHANA_EVENTS) {
    const startsAt = new Date();
    startsAt.setDate(startsAt.getDate() + seed.startsInDays);
    startsAt.setHours(19, 0, 0, 0);
    const endsAt = new Date(startsAt);
    endsAt.setHours(endsAt.getHours() + seed.durationHours);

    const slug = await uniqueSlug(seed.name);

    const venue = await prisma.venue.create({
      data: {
        name: seed.venue.name,
        address: seed.venue.address,
        city: seed.venue.city,
        area: seed.venue.area,
        country: seed.venue.country,
      },
    });

    const created = await prisma.event.create({
      data: {
        organizerId,
        venueId: venue.id,
        name: seed.name,
        slug,
        category: seed.category,
        description: seed.description,
        mainImageUrl: seed.mainImageUrl,
        status: "SALES_OPEN",
        startsAt,
        endsAt,
        ageRestriction: "18+",
        dressCode: "Smart casual",
        ticketTypes: {
          create: seed.tickets.map((t, index) => ({
            name: t.name,
            price: t.price,
            currency: "GHS",
            quantityTotal: t.quantityTotal,
            sortOrder: index,
            isActive: true,
            salesStartsAt: new Date(),
            salesEndsAt: startsAt,
          })),
        },
      },
    });

    console.log(`  ✓ ${created.name} → /events/${created.slug}`);
  }

  console.log("Done.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
