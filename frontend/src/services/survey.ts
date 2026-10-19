import { API_URL, ApiError, api, backendConfigured } from "@/lib/api";

// The farmer survey. Sending answers needs no login. The results need the team's secret key.

export type SurveyPayload = {
  language: "en" | "pg" | "yo";
  tried?: string;
  consent: true;
  answers: Record<string, string | number | string[]>;
  name?: string;
  phone?: string;
  contactOk?: boolean;
  nameOk?: boolean;
  /** Hidden trap field: real people leave it empty. */
  website?: string;
};

export async function submitSurvey(payload: SurveyPayload): Promise<void> {
  if (!backendConfigured) throw new ApiError("The survey is not connected to a server yet.");
  await api("/api/survey/responses", { method: "POST", body: JSON.stringify(payload) }, { auth: false });
}

export type SurveyResults = {
  total: number;
  answered: Record<string, number>;
  choices: Record<string, Record<string, number>>;
  written: { id: string; at: string; q15: string; q16: string; name: string | null; contactOk: boolean }[];
  contacts: { id: string; at: string; name: string | null; phone: string | null }[];
};

export function loadSurveyResults(key: string): Promise<SurveyResults> {
  return api<SurveyResults>("/api/survey/results", { headers: { "X-Survey-Key": key } }, { auth: false });
}

/** The spreadsheet of every answer. Returns a file the browser can save. */
export async function downloadSurveyCsv(key: string): Promise<void> {
  const res = await fetch(`${API_URL}/api/survey/results.csv`, { headers: { "X-Survey-Key": key } });
  if (!res.ok) throw new ApiError(res.status === 401 ? "That key is not right." : "Could not download the spreadsheet.", res.status);
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement("a");
  a.href = url;
  a.download = "farmas-survey.csv";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
