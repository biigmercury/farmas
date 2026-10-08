# FarmAs API contract

**The source of truth is [`api/docs/API.md`](../api/docs/API.md)**: Philip's Node API, which the frontend calls.
The earlier draft of this file described a different, simpler API (`POST /chat/`). It was retired when the team
chose Philip's API as the backbone, so there is now one contract, not two.

## How the pieces fit

```
Browser (frontend/)  ──►  API (api/, Node + Postgres)  ──►  AI service (ai-service/, Python + OpenAI)
   Next.js                 login, farms, records,             intent extraction, health assessment,
                           confirm-before-save,               speech to text
                           WhatsApp webhook
```

- The frontend only talks to the API. It never calls the AI service and never sees an AI key.
- The API owns all farm data. The AI service never writes records.
- Every record created from chat needs the farmer's explicit "yes" (confirm-before-save).

## Frontend ↔ API (what the app uses)

| Screen | Calls |
|---|---|
| Sign up / log in | `POST /api/auth/register`, `POST /api/auth/login`, `GET /api/farms` |
| Onboarding | `POST /api/farms`, `POST /api/farms/:id/livestock` |
| Dashboard | `GET /api/farms/:id/dashboard`, `/expenses`, `/sales` |
| Chat | `POST /api/farms/:id/ai/messages`, `POST /api/farms/:id/ai/actions/:actionId/confirm` |
| Health | `POST /api/farms/:id/health/assess` (multipart) |
| Livestock / Finance | `GET /livestock`, `/batches`, `/expenses`, `/sales` |
| Alerts / Tasks | `GET` and `PATCH /alerts`, `/tasks` |

## Additions made to Philip's API for the frontend

1. `POST /api/farms/:farmId/livestock`: add animals (type, quantity). Needed by onboarding.
2. `POST .../ai/messages` now also returns `pending: { id, summary, intent } | null` so the app can show Yes / No
   buttons without a second request.
3. `POST .../health/assess` accepts extra optional fields: `species`, `total`, `onset`
   (`today|few-days|week-plus`), `drinking` (`normal|less`), `vaccinated` (`yes|no|unsure`).
4. Animal type `FISH` added (migration `20261008120000_add_fish_livestock_type`).
5. "Three don kpai" style messages now record **deaths** (previously always saved as 0).
6. CORS is limited to `FRONTEND_ORIGIN` instead of any website.

## API ↔ AI service

| Endpoint | In | Out |
|---|---|---|
| `POST /nlu/extract` | `{ text, context }` | `{ intent, confidence, language, entities }` |
| `POST /health/assess` | form: `symptoms`, optional `species`, `number_affected`, `total`, `mortality`, `onset`, `drinking`, `vaccinated`, `image` | risk level, observations, possible concerns, actions, vet escalation |
| `POST /stt/transcribe` | form: `file` | `{ transcription }` |

Details: [`ai-service/README.md`](../ai-service/README.md).

## Known gaps (tracked, not hidden)

- Replies from the API are written in Nigerian Pidgin even when the farmer writes English. The AI service already
  returns `language`; the API's reply templates need an English version.
- The WhatsApp webhook does not yet verify Meta's request signature (`X-Hub-Signature-256`).
- The browser keeps the login token in `localStorage`. Move it to an httpOnly cookie before a real launch.
