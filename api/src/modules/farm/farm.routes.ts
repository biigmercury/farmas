import { Router } from "express";
import { prisma } from "../../config/prisma";
import { requireAuth } from "../../middlewares/auth.middleware";
import { aiLimiter, healthLimiter } from "../../middlewares/rateLimit.middleware";
import { requireFarmAccess } from "../../middlewares/tenant.middleware";
import { validate } from "../../middlewares/validate.middleware";
import { asyncHandler } from "../../utils/asyncHandler";
import { aiRoutes } from "../ai/ai.routes";
import { healthRoutes } from "../health/health.routes";
import { findNearbyVets } from "../vets/vets.service";
import { getDashboard } from "./dashboard.service";
import { getInventory, removeLivestock } from "./inventory.service";
import {
  addLivestockSchema,
  alertActionSchema,
  createFarmSchema,
  farmParamsSchema,
  listQuerySchema,
  nearbyVetsQuerySchema,
  removeLivestockSchema,
  taskActionSchema,
} from "./farm.schemas";
import * as farmService from "./farm.service";

export const farmRoutes = Router();

farmRoutes.use(requireAuth);

farmRoutes.post(
  "/",
  validate(createFarmSchema),
  asyncHandler(async (req, res) => {
    const farm = await farmService.createFarm(req.user!.id, req.body);
    res.status(201).json({ success: true, data: { farm } });
  })
);

farmRoutes.get(
  "/",
  asyncHandler(async (req, res) => {
    const farms = await farmService.listFarmsForUser(req.user!.id, req.user!.role);
    res.json({ success: true, data: { farms } });
  })
);

farmRoutes.use("/:farmId", requireFarmAccess);

farmRoutes.get(
  "/:farmId",
  validate(farmParamsSchema, "params"),
  asyncHandler(async (req, res) => {
    const farm = await farmService.getFarm(req.params.farmId);
    res.json({ success: true, data: { farm } });
  })
);

farmRoutes.get(
  "/:farmId/dashboard",
  asyncHandler(async (req, res) => {
    const dashboard = await getDashboard(req.params.farmId);
    res.json({ success: true, data: dashboard });
  })
);

farmRoutes.get(
  "/:farmId/alerts",
  validate(listQuerySchema, "query"),
  asyncHandler(async (req, res) => {
    const { farmId } = req.params;
    const { limit, offset } = req.query as unknown as { limit: number; offset: number };
    const where = { farmId };
    const [alerts, total] = await Promise.all([
      prisma.alert.findMany({
        where,
        orderBy: [{ createdAt: "desc" }],
        take: limit,
        skip: offset,
      }),
      prisma.alert.count({ where }),
    ]);
    res.json({ success: true, data: { alerts, total, limit, offset } });
  })
);

farmRoutes.patch(
  "/:farmId/alerts/:alertId",
  validate(alertActionSchema),
  asyncHandler(async (req, res) => {
    const { farmId, alertId } = req.params;
    const existing = await prisma.alert.findFirst({ where: { id: alertId, farmId } });
    if (!existing) {
      res.status(404).json({ success: false, error: { message: "Alert no dey find.", code: "NOT_FOUND" } });
      return;
    }
    const alert = await prisma.alert.update({ where: { id: alertId }, data: { status: req.body.status } });
    res.json({ success: true, data: { alert } });
  })
);

farmRoutes.get(
  "/:farmId/tasks",
  validate(listQuerySchema, "query"),
  asyncHandler(async (req, res) => {
    const { farmId } = req.params;
    const { limit, offset } = req.query as unknown as { limit: number; offset: number };
    const status = typeof req.query.status === "string" && ["PENDING", "DONE"].includes(req.query.status)
      ? (req.query.status as "PENDING" | "DONE")
      : undefined;
    const where = { farmId, ...(status ? { status } : {}) };
    const [tasks, total] = await Promise.all([
      prisma.task.findMany({
        where,
        orderBy: { dueDate: "asc" },
        take: limit,
        skip: offset,
      }),
      prisma.task.count({ where }),
    ]);
    res.json({ success: true, data: { tasks, total, limit, offset } });
  })
);

farmRoutes.patch(
  "/:farmId/tasks/:taskId",
  validate(taskActionSchema),
  asyncHandler(async (req, res) => {
    const { farmId, taskId } = req.params;
    const existing = await prisma.task.findFirst({ where: { id: taskId, farmId } });
    if (!existing) {
      res.status(404).json({ success: false, error: { message: "Task no dey find.", code: "NOT_FOUND" } });
      return;
    }
    const task = await prisma.task.update({ where: { id: taskId }, data: { status: req.body.status } });
    res.json({ success: true, data: { task } });
  })
);

farmRoutes.get(
  "/:farmId/livestock",
  validate(listQuerySchema, "query"),
  asyncHandler(async (req, res) => {
    const { farmId } = req.params;
    const { limit, offset } = req.query as unknown as { limit: number; offset: number };
    const where = { farmId };
    const [livestock, total] = await Promise.all([
      prisma.livestock.findMany({ where, orderBy: { createdAt: "desc" }, take: limit, skip: offset }),
      prisma.livestock.count({ where }),
    ]);
    res.json({ success: true, data: { livestock, total, limit, offset } });
  })
);

farmRoutes.post(
  "/:farmId/livestock",
  validate(addLivestockSchema),
  asyncHandler(async (req, res) => {
    const result = await farmService.addLivestock(req.params.farmId, req.body);
    res.status(201).json({ success: true, data: result });
  })
);

farmRoutes.get(
  "/:farmId/inventory",
  asyncHandler(async (req, res) => {
    res.json({ success: true, data: await getInventory(req.params.farmId) });
  })
);

farmRoutes.post(
  "/:farmId/inventory/remove",
  validate(removeLivestockSchema),
  asyncHandler(async (req, res) => {
    const result = await removeLivestock(req.params.farmId, req.body);
    res.status(201).json({ success: true, data: { removed: -result.applied, remaining: result.remaining } });
  })
);

farmRoutes.get(
  "/:farmId/vets/nearby",
  validate(nearbyVetsQuerySchema, "query"),
  asyncHandler(async (req, res) => {
    const { lat, lng } = req.query as unknown as { lat: number; lng: number };
    res.json({ success: true, data: await findNearbyVets(lat, lng) });
  })
);

farmRoutes.get(
  "/:farmId/batches",
  validate(listQuerySchema, "query"),
  asyncHandler(async (req, res) => {
    const { farmId } = req.params;
    const { limit, offset } = req.query as unknown as { limit: number; offset: number };
    const where = { farmId };
    const [batches, total] = await Promise.all([
      prisma.batch.findMany({ where, orderBy: { purchaseDate: "desc" }, take: limit, skip: offset }),
      prisma.batch.count({ where }),
    ]);
    res.json({ success: true, data: { batches, total, limit, offset } });
  })
);

farmRoutes.get(
  "/:farmId/expenses",
  validate(listQuerySchema, "query"),
  asyncHandler(async (req, res) => {
    const { farmId } = req.params;
    const { limit, offset } = req.query as unknown as { limit: number; offset: number };
    const where = { farmId };
    const [expenses, total, sum] = await Promise.all([
      prisma.expense.findMany({ where, orderBy: { date: "desc" }, take: limit, skip: offset }),
      prisma.expense.count({ where }),
      prisma.expense.aggregate({ where, _sum: { amount: true } }),
    ]);
    res.json({
      success: true,
      data: { expenses, total, sumAmount: Number(sum._sum?.amount ?? 0), limit, offset },
    });
  })
);

farmRoutes.get(
  "/:farmId/sales",
  validate(listQuerySchema, "query"),
  asyncHandler(async (req, res) => {
    const { farmId } = req.params;
    const { limit, offset } = req.query as unknown as { limit: number; offset: number };
    const where = { farmId };
    const [sales, total, sum] = await Promise.all([
      prisma.sale.findMany({ where, orderBy: { date: "desc" }, take: limit, skip: offset }),
      prisma.sale.count({ where }),
      prisma.sale.aggregate({ where, _sum: { amount: true } }),
    ]);
    res.json({
      success: true,
      data: { sales, total, sumAmount: Number(sum._sum?.amount ?? 0), limit, offset },
    });
  })
);

farmRoutes.use("/:farmId/ai", aiLimiter, aiRoutes);
farmRoutes.use("/:farmId/health", healthLimiter, healthRoutes);
