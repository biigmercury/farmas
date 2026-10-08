import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
  LOG_LEVEL: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
    .default("info"),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  JWT_SECRET: z.string().min(8, "JWT_SECRET must be at least 8 characters"),
  JWT_EXPIRES_IN: z.string().default("7d"),
  // Websites allowed to call this API from a browser. Comma separated.
  FRONTEND_ORIGIN: z.string().default("http://localhost:3000"),
  MODEL_SERVICE_URL: z.string().min(1).default("http://localhost:8001"),
  MODEL_SERVICE_INTERNAL_KEY: z.string().default(""),
  WHATSAPP_TOKEN: z.string().default(""),
  WHATSAPP_PHONE_NUMBER_ID: z.string().default(""),
  WHATSAPP_VERIFY_TOKEN: z.string().default("farmas-verify-token"),
  WHATSAPP_GRAPH_API_VERSION: z.string().default("v20.0"),
  // From the Meta app dashboard. Needed to check that webhook calls really come from WhatsApp.
  WHATSAPP_APP_SECRET: z.string().default(""),
  // How many proxies sit between the internet and this API (Render/Railway: 1; with Cloudflare in front: 2).
  // Unset = 1 in production, 0 locally.
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(5).optional(),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error(
    "Invalid environment configuration:\n" +
      parsed.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`).join("\n")
  );
  process.exit(1);
}

export const env = parsed.data;

// A public deployment must not start with weak or missing secrets.
if (env.NODE_ENV === "production") {
  const problems: string[] = [];
  if (env.JWT_SECRET.length < 32 || /change-?me|paste|example|secret$/i.test(env.JWT_SECRET))
    problems.push("JWT_SECRET must be a long random string (32+ characters), not a placeholder.");
  if (env.MODEL_SERVICE_INTERNAL_KEY.length < 16)
    problems.push("MODEL_SERVICE_INTERNAL_KEY must be set (16+ characters) and match the AI service.");
  for (const origin of env.FRONTEND_ORIGIN.split(",").map((o) => o.trim()).filter(Boolean)) {
    if (!origin.startsWith("https://")) problems.push(`FRONTEND_ORIGIN must be https in production (got "${origin}").`);
  }
  if (/localhost|127\.0\.0\.1/.test(env.DATABASE_URL))
    problems.push("DATABASE_URL points at this computer. Use your hosted database.");
  if (problems.length > 0) {
    console.error("Unsafe production configuration:\n" + problems.map((p) => `  - ${p}`).join("\n"));
    process.exit(1);
  }
}
export type Env = typeof env;
