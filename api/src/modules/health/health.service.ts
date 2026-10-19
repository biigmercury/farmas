import {
  MlServiceError,
  mlClient,
  type HealthAssessment,
  type UploadLike,
} from "../../config/mlClient";
import type { LivestockType } from "@prisma/client";
import { prisma } from "../../config/prisma";
import { logger } from "../../utils/logger";
import { animals, t, type Lang } from "../../utils/lang";
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
  /** The language style of the reply (English or Pidgin). */
  lang?: Lang;
}

/** The fixed vet disclaimer, in Pidgin for a Pidgin reply. The meaning is the same; the English text is the official one. */
export const PIDGIN_DISCLAIMER =
  "FarmAs dey give AI help to decide wetin to do, but e no fit take the place of correct check from vet.";

export function formatAssessment(assessment: HealthAssessment, lang: Lang = "english"): string {
  const lines: string[] = [`${t(lang, "Risk level", "How serious e be")}: ${assessment.risk_level}`];

  if (assessment.observations.length > 0) {
    lines.push(`${t(lang, "Observations", "Wetin I see")}:`);
    for (const item of assessment.observations) lines.push(`- ${item}`);
  }
  if (assessment.possible_concerns.length > 0) {
    lines.push(`${t(lang, "Possible concerns", "Wetin fit cause am")}:`);
    for (const item of assessment.possible_concerns) lines.push(`- ${item}`);
  }
  if (assessment.recommended_actions.length > 0) {
    lines.push(`${t(lang, "Recommended actions", "Wetin you fit do now")}:`);
    for (const item of assessment.recommended_actions) lines.push(`- ${item}`);
  }
  if (assessment.requires_vet_escalation) {
    lines.push(
      t(
        lang,
        "This needs a vet. Please contact your veterinarian.",
        "This one dey reach vet level — abeg contact your veterinarian."
      )
    );
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
  const lang: Lang = input.lang ?? "english";

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
        t(
          input.lang ?? "english",
          "The AI assessment is not available right now. Please book a vet to look at this case.",
          "AI assessment no dey available right now. Make you book a vet to look at this case."
        ),
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

  // The AI writes the assessment in English (so the safety checks and wording stay reliable). For a Pidgin reply it is
  // then translated as a separate step, which reads much more naturally than asking for Pidgin and JSON at once.
  const assessmentText =
    lang === "pidgin" && !unavailable
      ? await mlClient.translate(formatAssessment(assessment, "english"), "pidgin")
      : formatAssessment(assessment, lang);
  const body = unavailable
    ? t(
        lang,
        "The AI assessment is not available right now, but I still saved the record for review.\n\n",
        "AI assessment no dey available right now, but I don still save the record for manual review.\n\n"
      ) + assessmentText
    : assessmentText;

  const removedLine = inventory
    ? t(
        lang,
        `\n\nI also took ${animals(inventory.type, inventory.removed)} off your inventory (${inventory.remaining} left).`,
        `\n\nI don also comot ${animals(inventory.type, inventory.removed)} from your inventory (${inventory.remaining} remain).`
      )
    : "";
  const disclaimer = lang === "pidgin" ? PIDGIN_DISCLAIMER : assessment.disclaimer || DEFAULT_DISCLAIMER;
  const text = `${body}${removedLine}\n\n${disclaimer}`;

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
