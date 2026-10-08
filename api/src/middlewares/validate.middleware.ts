import type { RequestHandler } from "express";
import type { ZodType } from "zod";
import { ApiError } from "../utils/apiError";

type Target = "body" | "query" | "params";

function parseInto(schema: ZodType, value: unknown, target: Target): unknown {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw ApiError.badRequest(
      "Invalid request.",
      result.error.issues.map((issue) => ({
        field: issue.path.join(".") || target,
        message: issue.message,
      }))
    );
  }
  return result.data;
}

export function validate(schema: ZodType, target: Target = "body"): RequestHandler {
  return (req, _res, next) => {
    try {
      if (target === "body") req.body = parseInto(schema, req.body, target);
      if (target === "query") {
        const parsed = parseInto(schema, req.query, target);
        Object.defineProperty(req, "query", {
          value: parsed,
          configurable: true,
          enumerable: true,
          writable: true,
        });
      }
      if (target === "params") {
        const parsed = parseInto(schema, req.params, target);
        Object.assign(req.params as Record<string, unknown>, parsed as object);
      }
      next();
    } catch (err) {
      next(err);
    }
  };
}
