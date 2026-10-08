import type { Role } from "@prisma/client";

declare module "express-serve-static-core" {
  interface Request {
    /** The exact bytes of the request body, kept so signed webhooks can be verified. */
    rawBody?: Buffer;
    user?: {
      id: string;
      role: Role;
      phone: string;
      name: string;
    };
  }
}
