import {
  MlServiceError,
  mlClient,
  type HealthAssessment,
  type UploadLike,
} from "../../config/mlClient";
import type { LivestockType } from "@prisma/client";
import { prisma } from "../../config/prisma";
import { logger } from "../../utils/logger";
import { animals } from "../../utils/lang";
import { evaluateFarm, raiseAlert } from "../farm/alertEngine.service";
import { adjustInventory, parseLivestockType } from "../farm/inventory.service";

export const DEFAULT_DISCLAIMER =
  "FarmAs provides AI-assisted decision support and does not replace professional veterinary diagnosis.";

export interface AssessInput {
  symptoms: string;
  numberAffected?: number;
  mortality?: number;
  species?: string;
  total?: number;
  onset?: string;
  drinking?: string;
  vaccinated?: string;
}

export function formatAssessment(assessment: HealthAssessment): string {
  const lines: string[] = [`Risk level: ${assessment.risk_level}`];

  if (assessment.observations.length > 0) {
    lines.push("Observations:");
    for (const item of assessment.observations) lines.push(`- ${item}`);
  }
  if (assessment.possible_concerns.length > 0) {
    lines.push("Possible concerns:");
    for (const item of assessment.possible_concerns) lines.push(`- ${item}`);
  }
  if (assessment.recommended_actions.length > 0) {
    lines.push("Recommended actions:");
    for (const item of assessment.recommended_actions) lines.push(`- ${item}`);
  }
  if (assessment.requires_vet_escalation) {
    lines.push("This one dey reach vet level — abeg contact your veterinarian.");
  }

  return lines.join("\n");
}

export async function assessAndRecord(
  farmId: string,
  input: AssessInput,
  image?: UploadLike
): Promise<{
  record: { id: string };
  assessment: HealthAssessment;
  unavailable: boolean;
  text: string;
  /** Set when dead animals were taken off the inventory. */
  inventory?: { type: LivestockType; removed: number; remaining: number };
}> {
  let assessment: HealthAssessment;
  let unavailable = false;

  try {
    assessment = await mlClient.assess(input.symptoms, image, {
      species: input.species,
      numberAffected: input.numberAffected,
      total: input.total,
      mortality: input.mortality,
      onset: input.onset,
      drinking: input.drinking,
      vaccinated: input.vaccinated,
    });
  } catch (err) {
    if (!(err instanceof MlServiceError)) throw err;
    unavailable = true;
    logger.warn({ farmId, reason: err.message }, "Health assessment unavailable");
    assessment = {
      risk_level: "MEDIUM",
      observations: [],
      possible_concerns: [],
      recommended_actions: [
        "AI assessment no dey available right now. Make you book a vet to look at this case.",
      ],
      requires_vet_escalation: true,
      disclaimer: DEFAULT_DISCLAIMER,
    };
  }

  const record = await prisma.healthRecord.create({
    data: {
      farmId,
      symptoms: input.symptoms,
      observations: assessment.observations.join("\n") || null,
      numberAffected: input.numberAffected ?? 1,
      mortality: input.mortality ?? 0,
      riskLevel: assessment.risk_level,
      aiAssessment: JSON.stringify({ ...assessment, serviceUnavailable: unavailable }, null, 2),
    },
  });

  // Dead animals are no longer available: take them off the count and keep a log entry for the dashboard.
  let inventory: { type: LivestockType; removed: number; remaining: number } | undefined;
  const deaths = input.mortality ?? 0;
  if (deaths > 0) {
    const type = parseLivestockType(input.species) ?? (await onlyActiveType(farmId));
    if (type) {
      const result = await prisma.$transaction((tx) =>
        adjustInventory(tx, farmId, type, -deaths, "DEATH", input.symptoms.slice(0, 120))
      );
      if (result.applied !== 0) inventory = { type, removed: -result.applied, remaining: result.remaining };
    }
  }

  if (assessment.requires_vet_escalation || assessment.risk_level === "HIGH") {
    const concerns = assessment.possible_concerns.join("; ");
    await raiseAlert(farmId, {
      type: "HEALTH_RISK",
      severity: assessment.requires_vet_escalation ? "CRITICAL" : "WARNING",
      title:
        assessment.risk_level === "HIGH"
          ? "High health risk reported"
          : "Vet escalation recommended",
      description: concerns || `Symptoms: ${input.symptoms}`,
    });
  }

  if ((input.mortality ?? 0) > 0 || (input.numberAffected ?? 0) > 1) {
    await evaluateFarm(farmId);
  }

  const body = unavailable
    ? "AI assessment no dey available right now, but I don still save the record for manual review.\n\n" +
      formatAssessment(assessment)
    : formatAssessment(assessment);

  const removedLine = inventory
    ? `\n\nI also took ${animals(inventory.type, inventory.removed)} off your inventory (${inventory.remaining} left).`
    : "";
  const text = `${body}${removedLine}\n\n${assessment.disclaimer || DEFAULT_DISCLAIMER}`;

  return { record, assessment, unavailable, text, inventory };
}

/** The animal type to use when the farmer did not say which: only safe if the farm keeps exactly one kind. */
async function onlyActiveType(farmId: string): Promise<LivestockType | undefined> {
  const rows = await prisma.livestock.groupBy({
    by: ["type"],
    where: { farmId, status: "ACTIVE", quantity: { gt: 0 } },
  });
  return rows.length === 1 ? rows[0].type : undefined;
}
