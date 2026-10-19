import { timingSafeEqual } from "node:crypto";
import { Router, type RequestHandler } from "express";
import { env } from "../../config/env";
import { ApiError } from "../../utils/apiError";
import { asyncHandler } from "../../utils/asyncHandler";
import { validate } from "../../middlewares/validate.middleware";
import { surveyLimiter } from "../../middlewares/rateLimit.middleware";
import { surveySubmitSchema, type SurveySubmit } from "./survey.schemas";
import { getCsv, getResults, saveResponse } from "./survey.service";

export const surveyRoutes = Router();

/** Anyone with the link can send an answer (farmers have no account). Spam is held back by a limit and a hidden trap field. */
surveyRoutes.post(
  "/responses",
  surveyLimiter,
  validate(surveySubmitSchema),
  asyncHandler(async (req, res) => {
    const body = req.body as SurveySubmit;
    // A real person never sees the hidden "website" box. If it has text, pretend all is well and save nothing.
    if (body.website) {
      res.status(201).json({ success: true, data: { id: "ok" } });
      return;
    }
    const id = await saveResponse(body);
    res.status(201).json({ success: true, data: { id } });
  })
);

/** The results are for the team only: they need the secret key set on the server. */
const requireResultsKey: RequestHandler = (req, _res, next) => {
  const expected = env.SURVEY_RESULTS_KEY;
  if (expected.length < 16) return next(ApiError.serviceUnavailable("The survey results page is not switched on yet."));
  const given = Buffer.from(String(req.header("x-survey-key") ?? ""));
  const wanted = Buffer.from(expected);
  if (given.length !== wanted.length || !timingSafeEqual(given, wanted)) {
    return next(new ApiError(401, "That key is not right."));
  }
  next();
};

surveyRoutes.get(
  "/results",
  surveyLimiter,
  requireResultsKey,
  asyncHandler(async (_req, res) => {
    res.json({ success: true, data: await getResults() });
  })
);

surveyRoutes.get(
  "/results.csv",
  surveyLimiter,
  requireResultsKey,
  asyncHandler(async (_req, res) => {
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", 'attachment; filename="farmas-survey.csv"');
    res.send("﻿" + (await getCsv())); // the BOM makes Excel show ₦ and Yoruba letters correctly
  })
);
