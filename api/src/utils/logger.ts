import pino from "pino";
import { env } from "../config/env";

export const logger = pino({
  level: env.LOG_LEVEL,
  base: { service: "farmas-api" },
  // Never write login tokens or cookies to the logs.
  redact: {
    paths: ["req.headers.authorization", "req.headers.cookie", 'req.headers["x-hub-signature-256"]', 'res.headers["set-cookie"]'],
    censor: "[hidden]",
  },
});
