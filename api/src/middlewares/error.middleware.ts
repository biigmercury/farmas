import type { ErrorRequestHandler, RequestHandler } from "express";
import multer from "multer";
import { ZodError } from "zod";
import { env } from "../config/env";
import { ApiError } from "../utils/apiError";
import { logger } from "../utils/logger";

export const notFoundHandler: RequestHandler = (req, _res, next) => {
  next(ApiError.notFound(`Route ${req.method} ${req.originalUrl} no exist.`));
};

export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  if (res.headersSent) return;

  if (err instanceof ApiError) {
    if (err.statusCode >= 500) {
      logger.error({ err, url: req.originalUrl, method: req.method }, "Request failed");
    } else {
      logger.warn(
        { code: err.code, message: err.message, url: req.originalUrl, method: req.method },
        "Request rejected"
      );
    }
    res.status(err.statusCode).json({
      success: false,
      error: { message: err.message, code: err.code, details: err.details },
    });
    return;
  }

  if (err instanceof ZodError) {
    res.status(400).json({
      success: false,
      error: {
        message: "Invalid request.",
        code: "VALIDATION_ERROR",
        details: err.issues.map((i) => ({ field: i.path.join("."), message: i.message })),
      },
    });
    return;
  }

  if (err instanceof multer.MulterError) {
    const message =
      err.code === "LIMIT_FILE_SIZE" ? "File too big. Maximum size na 8MB." : err.message;
    res.status(400).json({ success: false, error: { message, code: "UPLOAD_ERROR" } });
    return;
  }

  if (err instanceof SyntaxError && "body" in err) {
    res.status(400).json({
      success: false,
      error: { message: "Invalid JSON body.", code: "INVALID_JSON" },
    });
    return;
  }

  logger.error({ err, url: req.originalUrl, method: req.method }, "Unhandled error");
  res.status(500).json({
    success: false,
    error: {
      message:
        env.NODE_ENV === "production"
          ? "Something went wrong on our side. Please try again later."
          : (err as Error)?.message ?? "Unhandled error",
      code: "INTERNAL_ERROR",
    },
  });
};
