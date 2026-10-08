import type { AlertSeverity } from "@prisma/client";
import { prisma } from "../../config/prisma";
import { logger } from "../../utils/logger";

const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
const MORTALITY_THRESHOLD_RATIO = 0.03;
const CRITICAL_MORTALITY_RATIO = 0.1;
const FEED_DROP_RATIO = 0.3;
const HEALTH_CLUSTER_MIN = 2;

const SEVERITY_RANK: Record<AlertSeverity, number> = {
  INFO: 0,
  LOW_RISK: 1,
  WARNING: 2,
  CRITICAL: 3,
};

export interface RaiseAlertInput {
  type: string;
  severity: AlertSeverity;
  title: string;
  description?: string;
}

export async function raiseAlert(farmId: string, input: RaiseAlertInput) {
  const existing = await prisma.alert.findFirst({
    where: { farmId, type: input.type, status: "ACTIVE" },
  });

  if (!existing) {
    return prisma.alert.create({ data: { farmId, ...input } });
  }

  if (SEVERITY_RANK[input.severity] > SEVERITY_RANK[existing.severity]) {
    return prisma.alert.update({
      where: { id: existing.id },
      data: { severity: input.severity, title: input.title, description: input.description },
    });
  }
  return existing;
}

async function evaluateMortality(farmId: string): Promise<void> {
  const batches = await prisma.batch.findMany({
    where: { farmId, status: "ACTIVE" },
    select: { id: true, name: true, quantity: true },
  });

  for (const batch of batches) {
    const agg = await prisma.healthRecord.aggregate({
      where: { farmId, batchId: batch.id },
      _sum: { mortality: true },
    });
    const totalMortality = agg._sum.mortality ?? 0;
    const floor = Math.max(1, Math.floor(batch.quantity * MORTALITY_THRESHOLD_RATIO));
    if (totalMortality <= floor) continue;

    const pct = ((totalMortality / batch.quantity) * 100).toFixed(1);
    const critical = totalMortality >= batch.quantity * CRITICAL_MORTALITY_RATIO;
    await raiseAlert(farmId, {
      type: "MORTALITY",
      severity: critical ? "CRITICAL" : "WARNING",
      title: `High mortality in ${batch.name}`,
      description: `${totalMortality} of ${batch.quantity} animals don kpai (${pct}%). Threshold na ${(
        MORTALITY_THRESHOLD_RATIO * 100
      ).toFixed(0)}%. Abeg call your vet.`,
    });
  }

  const livestockAgg = await prisma.livestock.aggregate({
    where: { farmId, status: "ACTIVE" },
    _sum: { quantity: true },
  });
  const totalHerd = livestockAgg._sum.quantity ?? 0;
  if (totalHerd <= 0) return;

  const recentMortality = await prisma.healthRecord.aggregate({
    where: { farmId, createdAt: { gte: new Date(Date.now() - 30 * DAY_MS) } },
    _sum: { mortality: true },
  });
  const total = recentMortality._sum.mortality ?? 0;
  const floor = Math.max(1, Math.floor(totalHerd * MORTALITY_THRESHOLD_RATIO));
  if (total <= floor) return;

  const pct = ((total / totalHerd) * 100).toFixed(1);
  await raiseAlert(farmId, {
    type: "MORTALITY_WIDE",
    severity: total >= totalHerd * CRITICAL_MORTALITY_RATIO ? "CRITICAL" : "WARNING",
    title: "Farm-wide mortality above threshold",
    description: `${total} mortalities in the last 30 days (${pct}% of ${totalHerd} animals).`,
  });
}

async function evaluateFeedDrop(farmId: string): Promise<void> {
  const records = await prisma.feedRecord.findMany({
    where: { farmId, date: { gte: new Date(Date.now() - 10 * DAY_MS) } },
    select: { date: true, quantity: true },
  });
  if (records.length < 3) return;

  const now = Date.now();
  const priorWindow = records.filter((r) => {
    const age = now - r.date.getTime();
    return age > 3 * DAY_MS && age <= 10 * DAY_MS;
  });
  if (priorWindow.length < 3) return;

  const recentWindow = records.filter((r) => now - r.date.getTime() <= 3 * DAY_MS);

  const priorAvg = priorWindow.reduce((s, r) => s + r.quantity, 0) / 7;
  const recentAvg = recentWindow.reduce((s, r) => s + r.quantity, 0) / 3;

  if (priorAvg <= 0) return;
  if (recentAvg > priorAvg * (1 - FEED_DROP_RATIO)) return;

  const drop = ((1 - recentAvg / priorAvg) * 100).toFixed(0);
  await raiseAlert(farmId, {
    type: "FEED_DROP",
    severity: "LOW_RISK",
    title: "Unusual drop in feed consumption",
    description: `Feed usage don drop ${drop}% compared to the previous week (${recentAvg.toFixed(
      1
    )}/day vs ${priorAvg.toFixed(1)}/day). Check say animals dey chop well.`,
  });
}

async function evaluateHealthCluster(farmId: string): Promise<void> {
  const since = new Date(Date.now() - 48 * HOUR_MS);
  const complaints = await prisma.healthRecord.count({
    where: { farmId, createdAt: { gte: since } },
  });
  if (complaints < HEALTH_CLUSTER_MIN) return;

  await raiseAlert(farmId, {
    type: "HEALTH_CLUSTER",
    severity: "WARNING",
    title: "Multiple health complaints recently",
    description: `${complaints} health reports don enter in the last 48 hours. This fit mean say infection dey spread.`,
  });
}

export async function evaluateFarm(farmId: string): Promise<void> {
  const checks: Array<[string, () => Promise<void>]> = [
    ["mortality", () => evaluateMortality(farmId)],
    ["feed-drop", () => evaluateFeedDrop(farmId)],
    ["health-cluster", () => evaluateHealthCluster(farmId)],
  ];

  for (const [name, run] of checks) {
    try {
      await run();
    } catch (err) {
      logger.error({ err, farmId, check: name }, "Alert evaluation failed");
    }
  }
}
