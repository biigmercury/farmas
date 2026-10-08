import axios, { AxiosError } from "axios";
import { env } from "./env";
import { logger } from "../utils/logger";

export type NluIntent =
  | "CREATE_EXPENSE"
  | "CREATE_SALE"
  | "CREATE_LIVESTOCK"
  | "CREATE_FEED_RECORD"
  | "CREATE_HEALTH_RECORD"
  | "REMOVE_LIVESTOCK"
  | "QUERY_EXPENSES"
  | "QUERY_SALES"
  | "QUERY_PROFIT"
  | "QUERY_LIVESTOCK"
  | "UNKNOWN";

export interface NluEntities {
  category?: string;
  livestock_type?: string;
  quantity?: number;
  amount?: number;
  date?: string;
  description?: string;
  symptoms?: string[];
  deaths?: number;
  reason?: "LOST" | "CONSUMED";
}

export interface NluResult {
  intent: NluIntent;
  confidence: number;
  language?: "english" | "pidgin";
  entities: NluEntities;
}

export type RiskLevelValue = "LOW" | "MEDIUM" | "HIGH";

export interface HealthAssessment {
  risk_level: RiskLevelValue;
  observations: string[];
  possible_concerns: string[];
  recommended_actions: string[];
  requires_vet_escalation: boolean;
  disclaimer: string;
}

/** Extra facts about the sick animals, sent to the AI service alongside the symptoms. */
export interface AssessContext {
  species?: string;
  numberAffected?: number;
  total?: number;
  mortality?: number;
  onset?: string;
  drinking?: string;
  vaccinated?: string;
}

export type MlService = "stt" | "nlu" | "health" | "chat";

export type ChatLanguage = "auto" | "english" | "pidgin";

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

export class MlServiceError extends Error {
  readonly service: MlService;

  constructor(service: MlService, message: string, cause?: unknown) {
    super(message);
    this.name = "MlServiceError";
    this.service = service;
    this.cause = cause;
  }
}

export const ML_UNAVAILABLE_MESSAGE =
  "Our AI service is not responding right now. Please try again in a short while.";

const http = axios.create({
  baseURL: env.MODEL_SERVICE_URL,
  timeout: 45_000,
  headers: env.MODEL_SERVICE_INTERNAL_KEY
    ? { "X-Internal-Key": env.MODEL_SERVICE_INTERNAL_KEY }
    : undefined,
});

function toMlError(service: MlService, err: unknown): MlServiceError {
  if (err instanceof AxiosError) {
    const status = err.response?.status;
    logger.error({ service, url: err.config?.url, status, message: err.message }, "ML service call failed");
    return new MlServiceError(
      service,
      status === 400
        ? `The AI service rejected the ${service.toUpperCase()} request.`
        : ML_UNAVAILABLE_MESSAGE,
      err
    );
  }
  logger.error({ service, err }, "Unexpected ML client error");
  return new MlServiceError(service, ML_UNAVAILABLE_MESSAGE, err);
}

async function postJson<T>(path: string, body: unknown, service: "nlu" | "health" | "chat"): Promise<T> {
  try {
    const res = await http.post<T>(path, body, {
      headers: { "Content-Type": "application/json" },
    });
    return res.data;
  } catch (err) {
    throw toMlError(service, err);
  }
}

async function postForm<T>(path: string, form: FormData, service: "stt" | "health"): Promise<T> {
  try {
    const res = await http.post<T>(path, form, {
      headers: { "Content-Type": "multipart/form-data" },
      timeout: 90_000,
    });
    return res.data;
  } catch (err) {
    throw toMlError(service, err);
  }
}

export interface UploadLike {
  buffer: Buffer;
  mimetype: string;
  originalname: string;
}

export const mlClient = {
  async transcribe(audio: UploadLike): Promise<string> {
    const form = new FormData();
    form.append("file", new Blob([new Uint8Array(audio.buffer)], { type: audio.mimetype }), audio.originalname);
    const result = await postForm<{ transcription?: string }>("/stt/transcribe", form, "stt");
    const transcription = result?.transcription?.trim();
    if (!transcription) {
      throw new MlServiceError("stt", "I could not hear that clearly. Please try again.");
    }
    return transcription;
  },

  async extract(text: string, context?: Record<string, unknown>): Promise<NluResult> {
    const result = await postJson<Partial<NluResult>>("/nlu/extract", { text, context }, "nlu");
    if (!result || typeof result.intent !== "string") {
      throw new MlServiceError("nlu", ML_UNAVAILABLE_MESSAGE);
    }
    return {
      intent: result.intent as NluIntent,
      confidence: typeof result.confidence === "number" ? result.confidence : 0,
      language: result.language === "english" || result.language === "pidgin" ? result.language : undefined,
      entities: result.entities ?? {},
    };
  },

  /** Chatbot mode: a plain-text answer to a general question. Never changes any record. */
  async chat(input: {
    message: string;
    history: ChatTurn[];
    language: ChatLanguage;
    farm?: Record<string, unknown>;
    vetsText?: string;
  }): Promise<string> {
    const result = await postJson<{ reply?: string }>(
      "/chat/answer",
      {
        message: input.message,
        history: input.history,
        language: input.language,
        farm: input.farm,
        vets_text: input.vetsText ?? "",
      },
      "chat"
    );
    const reply = result?.reply?.trim();
    if (!reply) throw new MlServiceError("chat", ML_UNAVAILABLE_MESSAGE);
    return reply;
  },

  async assess(
    symptoms: string,
    image?: UploadLike,
    extra: AssessContext = {}
  ): Promise<HealthAssessment> {
    const form = new FormData();
    form.append("symptoms", symptoms);
    const put = (name: string, value: unknown) => {
      if (value !== undefined && value !== null && value !== "") form.append(name, String(value));
    };
    put("species", extra.species);
    put("number_affected", extra.numberAffected);
    put("total", extra.total);
    put("mortality", extra.mortality);
    put("onset", extra.onset);
    put("drinking", extra.drinking);
    put("vaccinated", extra.vaccinated);
    if (image) {
      form.append("image", new Blob([new Uint8Array(image.buffer)], { type: image.mimetype }), image.originalname);
    }
    const result = await postForm<Partial<HealthAssessment>>("/health/assess", form, "health");
    if (!result || typeof result.risk_level !== "string") {
      throw new MlServiceError("health", ML_UNAVAILABLE_MESSAGE);
    }
    return {
      risk_level: (result.risk_level as RiskLevelValue) ?? "MEDIUM",
      observations: result.observations ?? [],
      possible_concerns: result.possible_concerns ?? [],
      recommended_actions: result.recommended_actions ?? [],
      requires_vet_escalation: Boolean(result.requires_vet_escalation),
      disclaimer:
        result.disclaimer ||
        "FarmAs provides AI-assisted decision support and does not replace professional veterinary diagnosis.",
    };
  },
};
