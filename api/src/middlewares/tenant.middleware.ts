import type { RequestHandler } from "express";
import { prisma } from "../config/prisma";
import { ApiError } from "../utils/apiError";
import { asyncHandler } from "../utils/asyncHandler";

export const requireFarmAccess: RequestHandler<{ farmId: string }> = asyncHandler(
  async (req, _res, next) => {
    const user = req.user;
    if (!user) {
      throw ApiError.unauthorized();
    }

    const { farmId } = req.params;
    if (!farmId) {
      throw ApiError.badRequest("farmId is required.");
    }

    const farm = await prisma.farm.findUnique({
      where: { id: farmId },
      select: { id: true, ownerId: true },
    });

    if (!farm) {
      throw ApiError.notFound("This farm no dey exist.");
    }

    if (farm.ownerId !== user.id && user.role !== "ADMIN") {
      throw ApiError.forbidden("You no get access to this farm's data.");
    }

    next();
  }
);
