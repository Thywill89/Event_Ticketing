import { Router } from "express";
import { z } from "zod";
import type {
  AdminOrganizerListResponse,
  AdminOrganizerResponse,
  AdminOrderListResponse,
  AdminPlatformStatsResponse,
  OrganizerStatus,
} from "@event-ticketing/shared";
import { Prisma } from "../../prisma/generated";
import { prisma } from "../db";
import { writeAuditLog } from "../lib/audit";
import { requirePlatformAdmin } from "../middleware/auth";

export const adminPlatformRouter = Router();

adminPlatformRouter.use("/admin", requirePlatformAdmin);

const organizerStatusSchema = z.object({
  status: z.enum(["PENDING", "APPROVED", "SUSPENDED"]).optional(),
});

/**
 * GET /admin/stats — basic platform overview (plan §11.1).
 */
adminPlatformRouter.get("/admin/stats", async (_req, res) => {
  const [
    organizersPending,
    organizersApproved,
    eventsPendingReview,
    eventsLive,
    paidAgg,
  ] = await Promise.all([
    prisma.organizer.count({ where: { status: "PENDING" } }),
    prisma.organizer.count({ where: { status: "APPROVED" } }),
    prisma.event.count({ where: { status: "PENDING_REVIEW" } }),
    prisma.event.count({ where: { status: "LIVE" } }),
    prisma.order.aggregate({
      where: { status: "PAID" },
      _count: { _all: true },
      _sum: { totalAmount: true },
    }),
  ]);

  const body: AdminPlatformStatsResponse = {
    stats: {
      organizersPending,
      organizersApproved,
      eventsPendingReview,
      eventsLive,
      ordersPaid: paidAgg._count._all,
      grossRevenue: (paidAgg._sum.totalAmount ?? new Prisma.Decimal(0)).toFixed(2),
      currency: "GHS",
    },
  };
  res.json(body);
});

/**
 * GET /admin/organizers?status=PENDING
 */
adminPlatformRouter.get("/admin/organizers", async (req, res) => {
  const parsed = organizerStatusSchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid query", details: parsed.error.flatten() });
    return;
  }

  const where =
    parsed.data.status !== undefined
      ? { status: parsed.data.status as OrganizerStatus }
      : {};

  const rows = await prisma.organizer.findMany({
    where,
    include: {
      user: { select: { email: true, fullName: true } },
      _count: { select: { events: true } },
    },
    orderBy: [{ createdAt: "desc" }],
  });

  const body: AdminOrganizerListResponse = {
    organizers: rows.map((o) => ({
      id: o.id,
      displayName: o.displayName,
      status: o.status,
      email: o.user.email,
      fullName: o.user.fullName,
      phone: o.phone,
      eventCount: o._count.events,
      createdAt: o.createdAt.toISOString(),
    })),
  };
  res.json(body);
});

async function setOrganizerStatus(
  req: { auth?: { sub: string }; params: { organizerId?: string } },
  res: {
    status: (code: number) => { json: (body: unknown) => void };
    json: (body: unknown) => void;
  },
  nextStatus: OrganizerStatus,
  action: string,
) {
  const organizerId = String(req.params.organizerId);
  const existing = await prisma.organizer.findUnique({
    where: { id: organizerId },
    include: {
      user: { select: { email: true, fullName: true } },
      _count: { select: { events: true } },
    },
  });
  if (!existing) {
    res.status(404).json({ error: "Organizer not found" });
    return;
  }

  if (existing.status === nextStatus) {
    const body: AdminOrganizerResponse = {
      organizer: {
        id: existing.id,
        displayName: existing.displayName,
        status: existing.status,
        email: existing.user.email,
        fullName: existing.user.fullName,
        phone: existing.phone,
        eventCount: existing._count.events,
        createdAt: existing.createdAt.toISOString(),
      },
    };
    res.json(body);
    return;
  }

  const updated = await prisma.$transaction(async (tx) => {
    const organizer = await tx.organizer.update({
      where: { id: existing.id },
      data: { status: nextStatus },
      include: {
        user: { select: { email: true, fullName: true } },
        _count: { select: { events: true } },
      },
    });

    if (nextStatus === "SUSPENDED") {
      await tx.user.update({
        where: { id: existing.userId },
        data: { isActive: false },
      });
    } else if (existing.status === "SUSPENDED") {
      await tx.user.update({
        where: { id: existing.userId },
        data: { isActive: true },
      });
    }

    await writeAuditLog(
      {
        actorId: req.auth!.sub,
        action,
        entityType: "Organizer",
        entityId: organizer.id,
        metadata: { from: existing.status, to: nextStatus },
      },
      tx,
    );

    return organizer;
  });

  const body: AdminOrganizerResponse = {
    organizer: {
      id: updated.id,
      displayName: updated.displayName,
      status: updated.status,
      email: updated.user.email,
      fullName: updated.user.fullName,
      phone: updated.phone,
      eventCount: updated._count.events,
      createdAt: updated.createdAt.toISOString(),
    },
  };
  res.json(body);
}

/** POST /admin/organizers/:organizerId/approve */
adminPlatformRouter.post(
  "/admin/organizers/:organizerId/approve",
  async (req, res) => {
    await setOrganizerStatus(req, res, "APPROVED", "organizer.approve");
  },
);

/** POST /admin/organizers/:organizerId/suspend */
adminPlatformRouter.post(
  "/admin/organizers/:organizerId/suspend",
  async (req, res) => {
    await setOrganizerStatus(req, res, "SUSPENDED", "organizer.suspend");
  },
);

/** POST /admin/organizers/:organizerId/reinstate — SUSPENDED → APPROVED */
adminPlatformRouter.post(
  "/admin/organizers/:organizerId/reinstate",
  async (req, res) => {
    await setOrganizerStatus(req, res, "APPROVED", "organizer.reinstate");
  },
);

const ordersQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).optional().default(50),
  status: z
    .enum(["PENDING", "RESERVED", "PAID", "FAILED", "CANCELLED", "REFUNDED"])
    .optional(),
});

/**
 * GET /admin/orders — recent orders / payment overview (plan §11.1).
 */
adminPlatformRouter.get("/admin/orders", async (req, res) => {
  const parsed = ordersQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid query", details: parsed.error.flatten() });
    return;
  }

  const orders = await prisma.order.findMany({
    where: parsed.data.status ? { status: parsed.data.status } : undefined,
    include: {
      event: { select: { id: true, name: true } },
      payment: { select: { status: true, provider: true } },
    },
    orderBy: { createdAt: "desc" },
    take: parsed.data.limit,
  });

  const body: AdminOrderListResponse = {
    orders: orders.map((o) => ({
      id: o.id,
      eventId: o.eventId,
      eventName: o.event.name,
      status: o.status,
      purchaserName: o.purchaserName,
      purchaserEmail: o.purchaserEmail,
      totalAmount: o.totalAmount.toFixed(2),
      currency: o.currency,
      paymentStatus: o.payment?.status ?? null,
      paymentProvider: o.payment?.provider ?? null,
      createdAt: o.createdAt.toISOString(),
    })),
  };
  res.json(body);
});
