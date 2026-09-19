import { Router } from "express";
import { PACKAGE_NAME } from "@event-ticketing/shared";

export const healthRouter = Router();

healthRouter.get("/health", (_req, res) => {
  res.json({
    ok: true,
    service: "@event-ticketing/api",
    shared: PACKAGE_NAME,
  });
});
