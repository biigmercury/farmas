import type { Farm, LivestockType } from "@prisma/client";
import { prisma } from "../../config/prisma";
import { ApiError } from "../../utils/apiError";
import type { AddLivestockInput, CreateFarmInput } from "./farm.schemas";

export async function createFarm(ownerId: string, input: CreateFarmInput): Promise<Farm> {
  return prisma.farm.create({
    data: {
      ownerId,
      name: input.name,
      location: input.location,
      farmType: input.farmType,
      size: input.size,
    },
  });
}

export async function listFarmsForUser(userId: string, role: string): Promise<Farm[]> {
  return prisma.farm.findMany({
    where: role === "ADMIN" ? {} : { ownerId: userId },
    orderBy: { createdAt: "desc" },
  });
}

const TYPE_LABEL: Record<LivestockType, string> = {
  POULTRY: "Poultry", GOAT: "Goat", SHEEP: "Sheep", CATTLE: "Cattle", PIG: "Pig", RABBIT: "Rabbit", FISH: "Fish",
};

/**
 * Add animals to a farm (used by onboarding). Keeps the two views in step inside one transaction:
 * the running count per type (Livestock) and a named group you can attach expenses and sales to (Batch).
 */
export async function addLivestock(farmId: string, input: AddLivestockInput) {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.livestock.findFirst({
      where: { farmId, type: input.type, status: "ACTIVE" },
      orderBy: { createdAt: "asc" },
    });
    const livestock = existing
      ? await tx.livestock.update({ where: { id: existing.id }, data: { quantity: existing.quantity + input.quantity } })
      : await tx.livestock.create({ data: { farmId, type: input.type, quantity: input.quantity, breed: input.breed } });

    const count = await tx.batch.count({ where: { farmId, livestockType: input.type } });
    const batch = await tx.batch.create({
      data: {
        farmId,
        livestockType: input.type,
        name: input.name?.trim() || `${TYPE_LABEL[input.type]} group ${count + 1}`,
        quantity: input.quantity,
        purchaseCost: 0,
      },
    });
    return { livestock, batch };
  });
}

export async function getFarm(farmId: string): Promise<Farm> {
  const farm = await prisma.farm.findUnique({ where: { id: farmId } });
  if (!farm) throw ApiError.notFound("This farm no dey exist.");
  return farm;
}
