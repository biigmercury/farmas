import cors from "cors";
import express from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import pinoHttp from "pino-http";
import { env } from "./config/env";
import { errorHandler, notFoundHandler } from "./middlewares/error.middleware";
import { loginLimiter, registerLimiter } from "./middlewares/rateLimit.middleware";
import { authRoutes } from "./modules/auth/auth.routes";
import { farmRoutes } from "./modules/farm/farm.routes";
import { whatsappRoutes } from "./modules/whatsapp/whatsapp.routes";
import { logger } from "./utils/logger";

export function createApp() {
  const app = express();

  app.disable("x-powered-by");
  // Behind the host's proxy (Render, Railway...) the real visitor address is in X-Forwarded-For.
  // Without this every visitor looks like the proxy and shares one rate-limit bucket.
  const proxyHops = env.TRUST_PROXY_HOPS ?? (env.NODE_ENV === "production" ? 1 : 0);
  if (proxyHops > 0) app.set("trust proxy", proxyHops);
  app.use(helmet());
  app.use(cors({ origin: env.FRONTEND_ORIGIN.split(",").map((o) => o.trim()).filter(Boolean) }));
  app.use(
    express.json({
      limit: "1mb",
      // Keep the raw bytes: WhatsApp signs them and we must check the signature on exactly these bytes.
      verify: (req, _res, buf) => {
        (req as express.Request).rawBody = buf;
      },
    })
  );
  app.use(express.urlencoded({ extended: true, limit: "1mb" }));
  app.use(
    pinoHttp({
      logger,
      autoLogging: {
        ignore: (req) => req.url === "/healthz",
      },
    })
  );

  app.get("/healthz", (_req, res) => {
    res.json({ status: "ok", service: "farmas-api", uptime: process.uptime() });
  });

  app.use(
    "/api",
    rateLimit({
      windowMs: 60_000,
      limit: 300,
      standardHeaders: "draft-7",
      legacyHeaders: false,
    })
  );
  app.use("/api/auth/login", loginLimiter);
  app.use("/api/auth/register", registerLimiter);
  app.use("/api/auth", authRoutes);
  app.use("/api/farms", farmRoutes);

  app.use(
    "/webhooks",
    rateLimit({
      windowMs: 60_000,
      limit: 600,
      standardHeaders: "draft-7",
      legacyHeaders: false,
    })
  );
  app.use("/webhooks", whatsappRoutes);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
