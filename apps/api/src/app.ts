import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import { env } from "./config/env";
import { adminEventsRouter } from "./routes/admin-events";
import { adminPlatformRouter } from "./routes/admin-platform";
import { authRouter } from "./routes/auth";
import { checkInsRouter } from "./routes/check-ins";
import { healthRouter } from "./routes/health";
import { ordersRouter } from "./routes/orders";
import { organizerEventStatusRouter } from "./routes/organizer-event-status";
import { organizerEventsRouter } from "./routes/organizer-events";
import { organizerOpsRouter } from "./routes/organizer-ops";
import { organizerStaffRouter } from "./routes/organizer-staff";
import { publicEventsRouter } from "./routes/public-events";
import { ticketsLookupRouter } from "./routes/tickets-lookup";

export function createApp() {
  const app = express();
  const origins = env.webOrigins();

  app.set("trust proxy", 1);

  app.use(
    cors({
      origin(origin, callback) {
        // Non-browser clients (no Origin) — allow.
        if (!origin) {
          callback(null, true);
          return;
        }
        if (origins.includes(origin)) {
          callback(null, true);
          return;
        }
        callback(null, false);
      },
      credentials: true,
    }),
  );
  app.use(cookieParser());
  // Capture raw body for Paystack webhook HMAC (x-paystack-signature).
  app.use(
    express.json({
      verify: (req, _res, buf) => {
        const url = req.url ?? "";
        if (url.includes("/payments/webhook")) {
          (req as express.Request & { rawBody?: Buffer }).rawBody = Buffer.from(buf);
        }
      },
    }),
  );
  app.use(healthRouter);
  app.use(authRouter);
  app.use(publicEventsRouter);
  app.use(ordersRouter);
  app.use(ticketsLookupRouter);
  app.use(checkInsRouter);
  app.use(adminEventsRouter);
  app.use(adminPlatformRouter);
  app.use(organizerEventsRouter);
  app.use(organizerEventStatusRouter);
  app.use(organizerStaffRouter);
  app.use(organizerOpsRouter);

  return app;
}
