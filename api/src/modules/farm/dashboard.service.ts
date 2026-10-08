import { prisma } from "../../config/prisma";
import { getMortality, getRecentActivity } from "./inventory.service";

function toNumber(value: unknown): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

export async function getDashboard(farmId: string) {
  const [
    farm,
    livestockByType,
    revenueAgg,
    expenseAgg,
    activeAlertCount,
    activeAlerts,
    upcomingTasks,
    batchAgg,
    mortality,
    activity,
  ] =
    await Promise.all([
      prisma.farm.findUnique({ where: { id: farmId }, select: { id: true, name: true, location: true } }),
      prisma.livestock.groupBy({
        by: ["type"],
        where: { farmId, status: "ACTIVE" },
        _sum: { quantity: true },
      }),
      prisma.sale.aggregate({ where: { farmId }, _sum: { amount: true }, _count: { _all: true } }),
      prisma.expense.aggregate({ where: { farmId }, _sum: { amount: true }, _count: { _all: true } }),
      prisma.alert.count({ where: { farmId, status: "ACTIVE" } }),
      prisma.alert.findMany({
        where: { farmId, status: "ACTIVE" },
        orderBy: [{ severity: "desc" }, { createdAt: "desc" }],
        take: 5,
        select: {
          id: true,
          type: true,
          severity: true,
          title: true,
          description: true,
          createdAt: true,
        },
      }),
      prisma.task.findMany({
        where: { farmId, status: "PENDING", dueDate: { gte: new Date() } },
        orderBy: { dueDate: "asc" },
        take: 5,
        select: { id: true, title: true, dueDate: true, category: true, status: true },
      }),
      prisma.batch.aggregate({
        where: { farmId, status: "ACTIVE" },
        _sum: { quantity: true },
        _count: { _all: true },
      }),
      getMortality(farmId, 7),
      getRecentActivity(farmId, 8),
    ]);

  const revenue = toNumber(revenueAgg._sum.amount);
  const expenses = toNumber(expenseAgg._sum.amount);
  const livestock = livestockByType.map((row) => ({
    type: row.type,
    quantity: row._sum.quantity ?? 0,
  }));
  const totalLivestock = livestock.reduce((sum, row) => sum + row.quantity, 0);

  return {
    farm: farm ? { id: farm.id, name: farm.name, location: farm.location } : null,
    currency: "NGN",
    totalLivestock,
    livestockByType: livestock,
    animalsInActiveBatches: batchAgg._sum.quantity ?? 0,
    activeBatchCount: batchAgg._count._all,
    revenue,
    revenueCount: revenueAgg._count._all,
    expenses,
    expenseCount: expenseAgg._count._all,
    estimatedProfit: revenue - expenses,
    activeAlertCount,
    activeAlerts,
    upcomingTasks,
    mortality,
    activity,
    generatedAt: new Date().toISOString(),
  };
}
