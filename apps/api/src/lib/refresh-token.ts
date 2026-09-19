import { createHash, randomBytes } from "node:crypto";
import type { Response } from "express";
import { env, parseTtlToMs } from "../config/env";
import { prisma } from "../db";

export const REFRESH_COOKIE_NAME = "et_refresh";

export function hashRefreshToken(rawToken: string): string {
  return createHash("sha256")
    .update(`${env.jwtRefreshPepper()}:${rawToken}`)
    .digest("hex");
}

export function generateRawRefreshToken(): string {
  return randomBytes(48).toString("base64url");
}

function refreshCookieOptions() {
  const maxAge = parseTtlToMs(env.refreshTokenTtl, "REFRESH_TOKEN_TTL");
  return {
    httpOnly: true,
    secure: env.cookieSecure,
    sameSite: "lax" as const,
    path: "/auth",
    maxAge,
  };
}

export function setRefreshCookie(res: Response, rawToken: string) {
  res.cookie(REFRESH_COOKIE_NAME, rawToken, refreshCookieOptions());
}

export function clearRefreshCookie(res: Response) {
  res.clearCookie(REFRESH_COOKIE_NAME, {
    httpOnly: true,
    secure: env.cookieSecure,
    sameSite: "lax",
    path: "/auth",
  });
}

export async function issueRefreshToken(input: {
  userId: string;
  userAgent?: string | null;
  ipAddress?: string | null;
}): Promise<string> {
  const rawToken = generateRawRefreshToken();
  const tokenHash = hashRefreshToken(rawToken);
  const expiresAt = new Date(
    Date.now() + parseTtlToMs(env.refreshTokenTtl, "REFRESH_TOKEN_TTL"),
  );

  await prisma.refreshToken.create({
    data: {
      userId: input.userId,
      tokenHash,
      expiresAt,
      userAgent: input.userAgent?.slice(0, 512) || null,
      ipAddress: input.ipAddress?.slice(0, 64) || null,
    },
  });

  return rawToken;
}

/**
 * Rotate refresh token. Reuse of a revoked token revokes the whole family (theft).
 */
export async function rotateRefreshToken(input: {
  rawToken: string;
  userAgent?: string | null;
  ipAddress?: string | null;
}): Promise<{ userId: string; rawToken: string } | null> {
  const tokenHash = hashRefreshToken(input.rawToken);
  const existing = await prisma.refreshToken.findUnique({
    where: { tokenHash },
  });

  if (!existing) return null;

  if (existing.revokedAt) {
    // Possible theft: revoke all sessions for this user.
    await prisma.refreshToken.updateMany({
      where: { userId: existing.userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return null;
  }

  if (existing.expiresAt.getTime() <= Date.now()) {
    await prisma.refreshToken.update({
      where: { id: existing.id },
      data: { revokedAt: new Date() },
    });
    return null;
  }

  const user = await prisma.user.findUnique({
    where: { id: existing.userId },
    select: { id: true, isActive: true },
  });
  if (!user?.isActive) {
    await prisma.refreshToken.update({
      where: { id: existing.id },
      data: { revokedAt: new Date() },
    });
    return null;
  }

  const nextRaw = generateRawRefreshToken();
  const nextHash = hashRefreshToken(nextRaw);
  const expiresAt = new Date(
    Date.now() + parseTtlToMs(env.refreshTokenTtl, "REFRESH_TOKEN_TTL"),
  );

  await prisma.$transaction(async (tx) => {
    const created = await tx.refreshToken.create({
      data: {
        userId: existing.userId,
        tokenHash: nextHash,
        expiresAt,
        userAgent: input.userAgent?.slice(0, 512) || null,
        ipAddress: input.ipAddress?.slice(0, 64) || null,
      },
    });
    await tx.refreshToken.update({
      where: { id: existing.id },
      data: { revokedAt: new Date(), replacedById: created.id },
    });
  });

  return { userId: existing.userId, rawToken: nextRaw };
}

export async function revokeRefreshToken(rawToken: string): Promise<void> {
  const tokenHash = hashRefreshToken(rawToken);
  await prisma.refreshToken.updateMany({
    where: { tokenHash, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

export async function revokeAllRefreshTokensForUser(userId: string): Promise<void> {
  await prisma.refreshToken.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}
