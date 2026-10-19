import { z } from "zod";

// The farmer survey: every choice question has a fixed list of allowed answers, so the results can be counted exactly.
// Free-text answers are length-limited. Nothing here needs a login: anyone with the link can answer.

export const CHOICES = {
  q1: ["poultry", "goats", "sheep", "cattle", "pigs", "fish", "rabbits", "other"], // several allowed
  q2: ["under_50", "50_200", "201_1000", "over_1000"],
  q3: ["under_1", "1_3", "4_10", "over_10"],
  q4: ["nothing", "notebook", "phone_notes", "spreadsheet_app", "other"],
  q5: ["exactly", "roughly", "no"],
  q6: ["none", "1_10", "11_50", "over_50"],
  q7: ["vet", "agrovet", "farmer", "self", "nobody"],
  q8: ["easy", "sometimes_hard", "very_hard"],
  q9a: ["smartphone", "button", "none"],
  q9b: ["daily", "sometimes", "never"],
  q10: ["talk", "type", "both"],
  q11: ["yoruba", "english", "pidgin", "hausa", "igbo", "other"],
  q12c: ["yes_all", "mostly", "not_really", "did_not_try"],
  q12d: ["yes", "with_vet", "no"],
  q13: ["record_voice", "sickness_vet", "reminders", "profit", "none"],
  q14: ["free_only", "up_to_1000", "1000_3000", "3000_5000", "more"],
} as const;

export const SCALES = ["q12", "q12b"] as const; // 1 to 5
export const TEXTS = ["q15", "q16"] as const;

const choice = <T extends readonly [string, ...string[]]>(values: T) => z.enum(values).optional();
const scale = z.number().int().min(1).max(5).optional();
const text = z.string().trim().max(1000).optional();

export const surveySubmitSchema = z.strictObject({
  language: z.enum(["en", "pg", "yo"]),
  /** Did they try the demo first? */
  tried: z.enum(["yes_fully", "yes_little", "no"]).optional(),
  consent: z.literal(true, { message: "Please tick the box to agree before sending." }),
  answers: z.strictObject({
    q1: z.array(z.enum(CHOICES.q1)).max(8).optional(),
    q2: choice(CHOICES.q2),
    q3: choice(CHOICES.q3),
    q4: choice(CHOICES.q4),
    q5: choice(CHOICES.q5),
    q6: choice(CHOICES.q6),
    q7: choice(CHOICES.q7),
    q8: choice(CHOICES.q8),
    q9a: choice(CHOICES.q9a),
    q9b: choice(CHOICES.q9b),
    q10: choice(CHOICES.q10),
    q11: choice(CHOICES.q11),
    q12: scale,
    q12b: scale,
    q12c: choice(CHOICES.q12c),
    q12d: choice(CHOICES.q12d),
    q13: choice(CHOICES.q13),
    q14: choice(CHOICES.q14),
    q15: text,
    q16: text,
  }),
  name: z.string().trim().max(60).optional(),
  phone: z.string().trim().max(24).optional(),
  contactOk: z.boolean().optional(),
  nameOk: z.boolean().optional(),
  /** A hidden field real people never fill in. If it has text, the sender is a bot. */
  website: z.string().max(200).optional(),
});

export type SurveySubmit = z.infer<typeof surveySubmitSchema>;
