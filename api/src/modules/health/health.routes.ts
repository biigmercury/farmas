import { Router } from "express";
import { prisma } from "../../config/prisma";
import { imageUpload } from "../../middlewares/upload.middleware";
import { validate } from "../../middlewares/validate.middleware";
import { asyncHandler } from "../../utils/asyncHandler";
import { assessSchema, listQuerySchema } from "./health.schemas";
import { assessAndRecord } from "./health.service";

export const healthRoutes = Router({ mergeParams: true });

healthRoutes.post(
  "/assess",
  imageUpload.single("image"),
  validate(assessSchema),
  asyncHandler(async (req, res) => {
    const { farmId } = req.params;
    const body = req.body as {
      symptoms: string;
      numberAffected: number;
      mortality: number;
      species?: string;
      total?: number;
      onset?: string;
      drinking?: string;
      vaccinated?: string;
    };

    const image = req.file
      ? {
          buffer: req.file.buffer,
          mimetype: req.file.mimetype,
          originalname: req.file.originalname,
        }
      : undefined;

    const result = await assessAndRecord(
      farmId,
      {
        symptoms: body.symptoms,
        numberAffected: body.numberAffected,
        mortality: body.mortality,
        species: body.species,
        total: body.total,
        onset: body.onset,
        drinking: body.drinking,
        vaccinated: body.vaccinated,
      },
      image
    );

    res.status(201).json({
      success: true,
      data: {
        healthRecordId: result.record.id,
        riskLevel: result.assessment.risk_level,
        requiresVetEscalation: result.assessment.requires_vet_escalation,
        observations: result.assessment.observations,
        possibleConcerns: result.assessment.possible_concerns,
        recommendedActions: result.assessment.recommended_actions,
        disclaimer: result.assessment.disclaimer,
        assessmentUnavailable: result.unavailable,
        text: result.text,
      },
    });
  })
);

healthRoutes.get(
  "/records",
  validate(listQuerySchema, "query"),
  asyncHandler(async (req, res) => {
    const { farmId } = req.params;
    const { limit, offset } = req.query as unknown as { limit: number; offset: number };

    const [records, total] = await Promise.all([
      prisma.healthRecord.findMany({
        where: { farmId },
        orderBy: { createdAt: "desc" },
        take: limit,
        skip: offset,
        select: {
          id: true,
          symptoms: true,
          observations: true,
          numberAffected: true,
          mortality: true,
          riskLevel: true,
          createdAt: true,
        },
      }),
      prisma.healthRecord.count({ where: { farmId } }),
    ]);

    res.json({ success: true, data: { records, total, limit, offset } });
  })
);
