import { Router } from "express";
import { requireAuth } from "../../middlewares/auth.middleware";
import { validate } from "../../middlewares/validate.middleware";
import { asyncHandler } from "../../utils/asyncHandler";
import { loginSchema, registerSchema } from "./auth.schemas";
import * as authService from "./auth.service";

export const authRoutes = Router();

authRoutes.post(
  "/register",
  validate(registerSchema),
  asyncHandler(async (req, res) => {
    const result = await authService.register(req.body);
    res.status(201).json({ success: true, data: result });
  })
);

authRoutes.post(
  "/login",
  validate(loginSchema),
  asyncHandler(async (req, res) => {
    const result = await authService.login(req.body);
    res.status(200).json({ success: true, data: result });
  })
);

authRoutes.get(
  "/me",
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = await authService.getMe(req.user!.id);
    res.status(200).json({ success: true, data: { user } });
  })
);
