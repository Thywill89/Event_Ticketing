import jwt from "jsonwebtoken";
import type { UserRole } from "@event-ticketing/shared";
import { env } from "../config/env";

export interface AccessTokenPayload {
  sub: string;
  email: string;
  role: UserRole;
  organizerId: string | null;
}

export function signAccessToken(payload: AccessTokenPayload): string {
  return jwt.sign(payload, env.jwtAccessSecret(), {
    expiresIn: env.accessTokenTtl as jwt.SignOptions["expiresIn"],
  });
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  const decoded = jwt.verify(token, env.jwtAccessSecret());
  if (typeof decoded !== "object" || decoded === null) {
    throw new Error("Invalid token payload");
  }

  const { sub, email, role, organizerId } = decoded as Record<string, unknown>;

  if (
    typeof sub !== "string" ||
    typeof email !== "string" ||
    typeof role !== "string" ||
    !(organizerId === null || typeof organizerId === "string")
  ) {
    throw new Error("Invalid token claims");
  }

  return {
    sub,
    email,
    role: role as UserRole,
    organizerId,
  };
}
