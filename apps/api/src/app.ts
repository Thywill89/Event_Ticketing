import cors from "cors";
import express from "express";
import { healthRouter } from "./routes/health";

export function createApp() {
  const app = express();

  app.use(cors());
  app.use(express.json());
  app.use(healthRouter);

  return app;
}
