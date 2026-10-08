import type { NextFunction, Request, RequestHandler, Response } from "express";

type AppRequest = Request<Record<string, string>, any, any, any>;

export function asyncHandler(
  fn: (req: AppRequest, res: Response, next: NextFunction) => Promise<unknown>
): RequestHandler {
  return (req, res, next) => {
    void Promise.resolve(fn(req as AppRequest, res as Response, next)).catch(next);
  };
}
