import multer from "multer";
import { ApiError } from "../utils/apiError";

const MAX_IMAGE_SIZE = 8 * 1024 * 1024;

export const imageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_IMAGE_SIZE, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith("image/")) {
      cb(null, true);
      return;
    }
    cb(ApiError.badRequest("Only image files dey allowed."));
  },
});
