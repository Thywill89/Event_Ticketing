import { Router } from "express";
import { z } from "zod";
import type {
  EventStaffListResponse,
  OrganizerStaffListResponse,
  OrganizerStaffResponse,
} from "@event-ticketing/shared";
import { prisma } from "../db";
import { writeAuditLog } from "../lib/audit";
import { hashPassword } from "../lib/password";
import { requireOrganizer } from "../middleware/auth";

export const organizerStaffRouter = Router();

organizerStaffRouter.use("/organizer", requireOrganizer);

const createStaffSchema = z.object({
  email: z.string().email().max(255),
  password: z.string().min(8).max(128),
  fullName: z.string().trim().min(1).max(120),
  eventId: z.string().min(1).optional(),
});

const updateStaffSchema = z.object({
  isActive: z.boolean().optional(),
  fullName: z.string().trim().min(1).max(120).optional(),
  password: z.string().min(8).max(128).optional(),
});

const assignSchema = z.object({
  staffId: z.string().min(1),
});

async function loadStaffDto(staffId: string, organizerId: string) {
  const staff = await prisma.organizerStaff.findFirst({
    where: { id: staffId, organizerId },
    include: {
      user: { select: { id: true, email: true, fullName: true } },
      events: { select: { eventId: true } },
    },
  });
  if (!staff) return null;
  return {
    id: staff.id,
    userId: staff.userId,
    email: staff.user.email,
    fullName: staff.user.fullName,
    isActive: staff.isActive,
    assignedEventIds: staff.events.map((e) => e.eventId),
    createdAt: staff.createdAt.toISOString(),
  };
}

/**
 * GET /organizer/staff — all door staff under this organizer.
 */
organizerStaffRouter.get("/organizer/staff", async (req, res) => {
  const organizerId = req.auth!.organizerId!;
  const rows = await prisma.organizerStaff.findMany({
    where: { organizerId },
    include: {
      user: { select: { id: true, email: true, fullName: true } },
      events: { select: { eventId: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  const body: OrganizerStaffListResponse = {
    staff: rows.map((staff) => ({
      id: staff.id,
      userId: staff.userId,
      email: staff.user.email,
      fullName: staff.user.fullName,
      isActive: staff.isActive,
      assignedEventIds: staff.events.map((e) => e.eventId),
      createdAt: staff.createdAt.toISOString(),
    })),
  };
  res.json(body);
});

/**
 * POST /organizer/staff — create (or re-link) check-in staff under this organizer.
 */
organizerStaffRouter.post("/organizer/staff", async (req, res) => {
  const organizerId = req.auth!.organizerId!;
  const parsed = createStaffSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request", details: parsed.error.flatten() });
    return;
  }

  const email = parsed.data.email.toLowerCase();
  const { password, fullName, eventId } = parsed.data;

  if (eventId) {
    const event = await prisma.event.findFirst({
      where: { id: eventId, organizerId },
      select: { id: true },
    });
    if (!event) {
      res.status(404).json({ error: "Event not found" });
      return;
    }
  }

  const existingUser = await prisma.user.findUnique({
    where: { email },
    select: { id: true, role: true, organizer: { select: { id: true } } },
  });

  if (existingUser?.organizer || existingUser?.role === "PLATFORM_ADMIN") {
    res.status(409).json({
      error: "Email belongs to an organizer or admin account",
    });
    return;
  }

  if (existingUser && existingUser.role !== "CHECK_IN_STAFF") {
    res.status(409).json({ error: "Email already registered with another role" });
    return;
  }

  const passwordHash = await hashPassword(password);

  try {
    const staffId = await prisma.$transaction(async (tx) => {
      const user = existingUser
        ? await tx.user.update({
            where: { id: existingUser.id },
            data: {
              passwordHash,
              fullName,
              role: "CHECK_IN_STAFF",
              isActive: true,
            },
          })
        : await tx.user.create({
            data: {
              email,
              passwordHash,
              fullName,
              role: "CHECK_IN_STAFF",
              isActive: true,
            },
          });

      const staff = await tx.organizerStaff.upsert({
        where: {
          organizerId_userId: { organizerId, userId: user.id },
        },
        create: { organizerId, userId: user.id, isActive: true },
        update: { isActive: true },
      });

      if (eventId) {
        await tx.eventStaffAssignment.upsert({
          where: {
            staffId_eventId: { staffId: staff.id, eventId },
          },
          create: { staffId: staff.id, eventId },
          update: {},
        });
      }

      await writeAuditLog(
        {
          actorId: req.auth!.sub,
          action: "staff.create",
          entityType: "OrganizerStaff",
          entityId: staff.id,
          metadata: { email, eventId: eventId ?? null },
        },
        tx,
      );

      return staff.id;
    });

    const dto = await loadStaffDto(staffId, organizerId);
    const body: OrganizerStaffResponse = { staff: dto! };
    res.status(201).json(body);
  } catch (err) {
    console.error("create staff failed", err);
    res.status(500).json({ error: "Failed to create staff" });
  }
});

/**
 * PATCH /organizer/staff/:staffId — activate/deactivate or update profile.
 */
organizerStaffRouter.patch("/organizer/staff/:staffId", async (req, res) => {
  const organizerId = req.auth!.organizerId!;
  const staffId = String(req.params.staffId);
  const parsed = updateStaffSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request", details: parsed.error.flatten() });
    return;
  }

  const existing = await prisma.organizerStaff.findFirst({
    where: { id: staffId, organizerId },
    include: { user: { select: { id: true } } },
  });
  if (!existing) {
    res.status(404).json({ error: "Staff not found" });
    return;
  }

  const data = parsed.data;
  if (
    data.isActive === undefined &&
    data.fullName === undefined &&
    data.password === undefined
  ) {
    res.status(400).json({ error: "No updates provided" });
    return;
  }

  await prisma.$transaction(async (tx) => {
    if (data.isActive !== undefined) {
      await tx.organizerStaff.update({
        where: { id: existing.id },
        data: { isActive: data.isActive },
      });
      if (!data.isActive) {
        await tx.user.update({
          where: { id: existing.userId },
          data: { isActive: false },
        });
      } else {
        await tx.user.update({
          where: { id: existing.userId },
          data: { isActive: true },
        });
      }
    }

    const userPatch: { fullName?: string; passwordHash?: string } = {};
    if (data.fullName !== undefined) userPatch.fullName = data.fullName;
    if (data.password !== undefined) {
      userPatch.passwordHash = await hashPassword(data.password);
    }
    if (Object.keys(userPatch).length > 0) {
      await tx.user.update({
        where: { id: existing.userId },
        data: userPatch,
      });
    }

    await writeAuditLog(
      {
        actorId: req.auth!.sub,
        action: "staff.update",
        entityType: "OrganizerStaff",
        entityId: existing.id,
        metadata: {
          isActive: data.isActive ?? null,
          fullNameChanged: data.fullName !== undefined,
          passwordReset: data.password !== undefined,
        },
      },
      tx,
    );
  });

  const dto = await loadStaffDto(staffId, organizerId);
  const body: OrganizerStaffResponse = { staff: dto! };
  res.json(body);
});

/**
 * GET /organizer/events/:eventId/staff — staff assigned to this event.
 */
organizerStaffRouter.get("/organizer/events/:eventId/staff", async (req, res) => {
  const organizerId = req.auth!.organizerId!;
  const eventId = String(req.params.eventId);

  const event = await prisma.event.findFirst({
    where: { id: eventId, organizerId },
    select: { id: true },
  });
  if (!event) {
    res.status(404).json({ error: "Event not found" });
    return;
  }

  const rows = await prisma.eventStaffAssignment.findMany({
    where: { eventId },
    include: {
      staff: {
        include: {
          user: { select: { email: true, fullName: true } },
        },
      },
    },
    orderBy: { id: "asc" },
  });

  const body: EventStaffListResponse = {
    staff: rows.map((row) => ({
      staffId: row.staffId,
      email: row.staff.user.email,
      fullName: row.staff.user.fullName,
      isActive: row.staff.isActive,
      assignedAt: row.staff.createdAt.toISOString(),
    })),
  };
  res.json(body);
});

/**
 * POST /organizer/events/:eventId/staff — assign existing staff to event.
 */
organizerStaffRouter.post("/organizer/events/:eventId/staff", async (req, res) => {
  const organizerId = req.auth!.organizerId!;
  const eventId = String(req.params.eventId);
  const parsed = assignSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request", details: parsed.error.flatten() });
    return;
  }

  const event = await prisma.event.findFirst({
    where: { id: eventId, organizerId },
    select: { id: true },
  });
  if (!event) {
    res.status(404).json({ error: "Event not found" });
    return;
  }

  const staff = await prisma.organizerStaff.findFirst({
    where: { id: parsed.data.staffId, organizerId, isActive: true },
  });
  if (!staff) {
    res.status(404).json({ error: "Staff not found or inactive" });
    return;
  }

  await prisma.$transaction(async (tx) => {
    await tx.eventStaffAssignment.upsert({
      where: {
        staffId_eventId: { staffId: staff.id, eventId },
      },
      create: { staffId: staff.id, eventId },
      update: {},
    });
    await writeAuditLog(
      {
        actorId: req.auth!.sub,
        action: "staff.assign_event",
        entityType: "EventStaffAssignment",
        entityId: eventId,
        metadata: { staffId: staff.id },
      },
      tx,
    );
  });

  const rows = await prisma.eventStaffAssignment.findMany({
    where: { eventId },
    include: {
      staff: {
        include: { user: { select: { email: true, fullName: true } } },
      },
    },
  });

  const body: EventStaffListResponse = {
    staff: rows.map((row) => ({
      staffId: row.staffId,
      email: row.staff.user.email,
      fullName: row.staff.user.fullName,
      isActive: row.staff.isActive,
      assignedAt: row.staff.createdAt.toISOString(),
    })),
  };
  res.status(201).json(body);
});

/**
 * DELETE /organizer/events/:eventId/staff/:staffId — unassign from event.
 */
organizerStaffRouter.delete(
  "/organizer/events/:eventId/staff/:staffId",
  async (req, res) => {
    const organizerId = req.auth!.organizerId!;
    const eventId = String(req.params.eventId);
    const staffId = String(req.params.staffId);

    const event = await prisma.event.findFirst({
      where: { id: eventId, organizerId },
      select: { id: true },
    });
    if (!event) {
      res.status(404).json({ error: "Event not found" });
      return;
    }

    const staff = await prisma.organizerStaff.findFirst({
      where: { id: staffId, organizerId },
    });
    if (!staff) {
      res.status(404).json({ error: "Staff not found" });
      return;
    }

    await prisma.$transaction(async (tx) => {
      await tx.eventStaffAssignment.deleteMany({
        where: { staffId, eventId },
      });
      await writeAuditLog(
        {
          actorId: req.auth!.sub,
          action: "staff.unassign_event",
          entityType: "EventStaffAssignment",
          entityId: eventId,
          metadata: { staffId },
        },
        tx,
      );
    });

    res.status(204).send();
  },
);
