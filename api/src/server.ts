import { createApp } from "./app";
import { env } from "./config/env";
import { disconnectPrisma, prisma } from "./config/prisma";
import { logger } from "./utils/logger";

async function main(): Promise<void> {
  await prisma.$connect();
  logger.info("Database connected");

  const app = createApp();
  const server = app.listen(env.PORT, () => {
    logger.info(`FARMAS API dey listen on port ${env.PORT} (${env.NODE_ENV})`);
  });

  const shutdown = async (signal: string): Promise<void> => {
    logger.info({ signal }, "Shutting down");
    server.close(async () => {
      await disconnectPrisma();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  };

  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

main().catch((err) => {
  logger.error({ err }, "Failed to start server");
  process.exit(1);
});
