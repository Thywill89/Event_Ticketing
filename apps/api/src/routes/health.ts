import { Router } from "express";
import { PACKAGE_NAME } from "@event-me/shared";
import { prisma } from "../db";

export const healthRouter = Router();

healthRouter.get("/health", async (_req, res) => {
  let database: "up" | "down" = "down";

  try {
    await prisma.$queryRaw`SELECT 1`;
    database = "up";
  } catch {
    database = "down";
  }

  res.json({
    ok: true,
    service: "@event-me/api",
    shared: PACKAGE_NAME,
    database,
  });
});
