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

const MAX_AUDIO_SIZE = 16 * 1024 * 1024;

/** Voice recordings from the app (browsers record webm or mp4) and voice notes. */
export const audioUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_AUDIO_SIZE, files: 1 },
  fileFilter: (_req, file, cb) => {
    // Some browsers label an audio-only recording "video/webm" or "video/mp4".
    if (/^(audio\/|video\/(webm|mp4))/.test(file.mimetype)) {
      cb(null, true);
      return;
    }
    cb(ApiError.badRequest("Only audio recordings are allowed."));
  },
});
