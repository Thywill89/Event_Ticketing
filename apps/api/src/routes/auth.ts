import { Router } from "express";
import { z } from "zod";
import type {
  AuthUserDto,
  LoginResponse,
  OrganizerRegisterResponse,
  OrganizerStatus,
  RefreshTokenResponse,
  UserRole,
} from "@event-ticketing/shared";
import { env } from "../config/env";
import { prisma } from "../db";
import { signAccessToken } from "../lib/jwt";
import { hashPassword, verifyPassword } from "../lib/password";
import {
  REFRESH_COOKIE_NAME,
  clearRefreshCookie,
  issueRefreshToken,
  revokeRefreshToken,
  rotateRefreshToken,
  setRefreshCookie,
} from "../lib/refresh-token";
import {
  requireAuth,
  requireOrganizer,
  requirePlatformAdmin,
} from "../middleware/auth";

const registerSchema = z.object({
  email: z.string().email().max(255),
  password: z.string().min(8).max(128),
  fullName: z.string().trim().min(1).max(120),
  displayName: z.string().trim().min(1).max(120),
  phone: z.string().trim().min(5).max(40).optional(),
});

const loginSchema = z.object({
  email: z.string().email().max(255),
  password: z.string().min(1).max(128),
});

function toAuthUserDto(input: {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
  organizer: {
    id: string;
    displayName: string;
    status: OrganizerStatus;
  } | null;
}): AuthUserDto {
  return {
    id: input.id,
    email: input.email,
    fullName: input.fullName,
    role: input.role,
    organizer: input.organizer
      ? {
          id: input.organizer.id,
          displayName: input.organizer.displayName,
          status: input.organizer.status,
        }
      : null,
  };
}

function clientMeta(req: { get: (name: string) => string | undefined; ip?: string }) {
  return {
    userAgent: req.get("user-agent") ?? null,
    ipAddress: req.ip ?? null,
  };
}

async function attachSession(
  res: import("express").Response,
  user: {
    id: string;
    email: string;
    fullName: string;
    role: UserRole;
    organizer: {
      id: string;
      displayName: string;
      status: OrganizerStatus;
    } | null;
  },
  meta: { userAgent: string | null; ipAddress: string | null },
): Promise<LoginResponse> {
  const token = signAccessToken({
    sub: user.id,
    email: user.email,
    role: user.role,
    organizerId: user.organizer?.id ?? null,
  });

  const rawRefresh = await issueRefreshToken({
    userId: user.id,
    userAgent: meta.userAgent,
    ipAddress: meta.ipAddress,
  });
  setRefreshCookie(res, rawRefresh);

  return {
    token,
    user: toAuthUserDto(user),
  };
}

export const authRouter = Router();

/**
 * POST /auth/organizer/register
 * Creates User (ORGANIZER) + Organizer and returns access JWT + refresh cookie.
 */
authRouter.post("/auth/organizer/register", async (req, res) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request", details: parsed.error.flatten() });
    return;
  }

  const { email, password, fullName, displayName, phone } = parsed.data;
  const normalizedEmail = email.toLowerCase();

  const existing = await prisma.user.findUnique({
    where: { email: normalizedEmail },
    select: { id: true },
  });
  if (existing) {
    res.status(409).json({ error: "Email already registered" });
    return;
  }

  const passwordHash = await hashPassword(password);
  const organizerStatus: OrganizerStatus = env.organizerAutoApprove
    ? "APPROVED"
    : "PENDING";

  const created = await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        email: normalizedEmail,
        passwordHash,
        fullName,
        role: "ORGANIZER",
      },
    });

    const organizer = await tx.organizer.create({
      data: {
        userId: user.id,
        displayName,
        phone: phone ?? null,
        status: organizerStatus,
      },
    });

    return { user, organizer };
  });

  const body: OrganizerRegisterResponse = await attachSession(
    res,
    {
      id: created.user.id,
      email: created.user.email,
      fullName: created.user.fullName,
      role: "ORGANIZER",
      organizer: {
        id: created.organizer.id,
        displayName: created.organizer.displayName,
        status: created.organizer.status,
      },
    },
    clientMeta(req),
  );

  res.status(201).json(body);
});

/**
 * POST /auth/login
 * Email/password login — access JWT in body, refresh token in httpOnly cookie.
 */
authRouter.post("/auth/login", async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request", details: parsed.error.flatten() });
    return;
  }

  const normalizedEmail = parsed.data.email.toLowerCase();

  const user = await prisma.user.findUnique({
    where: { email: normalizedEmail },
    include: {
      organizer: {
        select: { id: true, displayName: true, status: true },
      },
    },
  });

  if (!user || !user.isActive) {
    res.status(401).json({ error: "Invalid email or password" });
    return;
  }

  const ok = await verifyPassword(parsed.data.password, user.passwordHash);
  if (!ok) {
    res.status(401).json({ error: "Invalid email or password" });
    return;
  }

  const body = await attachSession(
    res,
    {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      role: user.role,
      organizer: user.organizer,
    },
    clientMeta(req),
  );

  res.json(body);
});

/**
 * POST /auth/refresh
 * Rotates refresh cookie and returns a new short-lived access JWT.
 */
authRouter.post("/auth/refresh", async (req, res) => {
  const raw = req.cookies?.[REFRESH_COOKIE_NAME] as string | undefined;
  if (!raw) {
    clearRefreshCookie(res);
    res.status(401).json({ error: "Missing refresh session" });
    return;
  }

  const rotated = await rotateRefreshToken({
    rawToken: raw,
    ...clientMeta(req),
  });

  if (!rotated) {
    clearRefreshCookie(res);
    res.status(401).json({ error: "Invalid or expired refresh session" });
    return;
  }

  const user = await prisma.user.findUnique({
    where: { id: rotated.userId },
    include: {
      organizer: {
        select: { id: true, displayName: true, status: true },
      },
    },
  });

  if (!user || !user.isActive) {
    clearRefreshCookie(res);
    res.status(401).json({ error: "Account inactive or not found" });
    return;
  }

  setRefreshCookie(res, rotated.rawToken);

  const token = signAccessToken({
    sub: user.id,
    email: user.email,
    role: user.role,
    organizerId: user.organizer?.id ?? null,
  });

  const body: RefreshTokenResponse = {
    token,
    user: toAuthUserDto({
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      role: user.role,
      organizer: user.organizer,
    }),
  };

  res.json(body);
});

/** POST /auth/logout — revoke refresh token and clear cookie. */
authRouter.post("/auth/logout", async (req, res) => {
  const raw = req.cookies?.[REFRESH_COOKIE_NAME] as string | undefined;
  if (raw) {
    await revokeRefreshToken(raw);
  }
  clearRefreshCookie(res);
  res.json({ ok: true });
});

/** GET /auth/me — current user from Bearer access token */
authRouter.get("/auth/me", requireAuth, async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.auth!.sub },
    include: {
      organizer: {
        select: { id: true, displayName: true, status: true },
      },
    },
  });

  if (!user || !user.isActive) {
    res.status(401).json({ error: "Account inactive or not found" });
    return;
  }

  res.json({
    user: toAuthUserDto({
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      role: user.role,
      organizer: user.organizer,
    }),
  });
});

/**
 * GET /auth/organizer/ping — smoke route proving requireOrganizer middleware.
 */
authRouter.get("/auth/organizer/ping", requireOrganizer, (req, res) => {
  res.json({
    ok: true,
    userId: req.auth!.sub,
    organizerId: req.auth!.organizerId,
  });
});

/** GET /auth/admin/ping — smoke route proving requirePlatformAdmin middleware. */
authRouter.get("/auth/admin/ping", requirePlatformAdmin, (req, res) => {
  res.json({
    ok: true,
    userId: req.auth!.sub,
    role: req.auth!.role,
  });
});
