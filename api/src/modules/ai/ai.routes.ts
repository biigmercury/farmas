import { Router } from "express";
import { validate } from "../../middlewares/validate.middleware";
import { asyncHandler } from "../../utils/asyncHandler";
import { aiMessageSchema, confirmActionSchema } from "./ai.schemas";
import { confirmAction, getPendingAction, processInput } from "./nlu.service";

export const aiRoutes = Router({ mergeParams: true });

aiRoutes.post(
  "/messages",
  validate(aiMessageSchema),
  asyncHandler(async (req, res) => {
    const { farmId } = req.params;
    const user = req.user!;

    const response = await processInput({
      farmId,
      userId: user.id,
      text: req.body.text,
      channel: "APP",
    });

    // If this message created a "save this?" proposal, hand it back so the app can show Yes / No buttons.
    const pending = await getPendingAction(farmId);
    res.json({
      success: true,
      data: {
        response,
        pending: pending
          ? {
              id: pending.id,
              summary: pending.actionTaken.replace(/^Create [^:]+: /, ""),
              intent: pending.detectedIntent,
            }
          : null,
      },
    });
  })
);

aiRoutes.get(
  "/actions/pending",
  asyncHandler(async (req, res) => {
    const { farmId } = req.params;
    const action = await getPendingAction(farmId);

    res.json({
      success: true,
      data: {
        action: action
          ? {
              id: action.id,
              actionTaken: action.actionTaken,
              detectedIntent: action.detectedIntent,
              confidence: action.confidence,
              confirmationStatus: action.confirmationStatus,
              createdAt: action.createdAt,
            }
          : null,
      },
    });
  })
);

aiRoutes.post(
  "/actions/:actionId/confirm",
  validate(confirmActionSchema),
  asyncHandler(async (req, res) => {
    const { farmId, actionId } = req.params;
    const { confirmed } = req.body as { confirmed: boolean };

    const response = await confirmAction(actionId, farmId, confirmed);
    res.json({ success: true, data: { response } });
  })
);
