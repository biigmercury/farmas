# FarmAs: Your AI Farm Companion

Talk to your farm the way you talk. FarmAs turns everyday English and Nigerian Pidgin (text, voice, WhatsApp)
into farm records, answers from your own data, health risk assessments and early warnings.

> "I don sell 20 birds for 75k" → FarmAs asks "Should I save this?" → you say yes → it is in your records.

## How it fits together

```
frontend/    Next.js app: landing page, sign up, onboarding, dashboard, chat, health, tasks
api/         Node + Express + Postgres (Prisma): login, farms, records, confirm-before-save, WhatsApp webhook
ai-service/  Python + FastAPI + OpenAI: understands messages, assesses health, transcribes voice
docs/        API reference and contract notes
```

The browser talks only to `api/`. The AI key lives only in `ai-service/` (and the root `.env`). Nothing is saved
to the database until the farmer confirms. Details: [`docs/API_CONTRACT.md`](docs/API_CONTRACT.md),
[`api/docs/API.md`](api/docs/API.md), [`ai-service/README.md`](ai-service/README.md).

Glory's first prototype (`backend/`, `chatbot/`, `chat_ui/`, `knowledge/`) is superseded: its knowledge base now
lives in `ai-service/knowledge/`, and the old folders are not needed.

## First-time setup

You need Node 20+, Python 3.11+, and a PostgreSQL database (a free Neon or Supabase project works).

1. **Secrets**: copy each example and fill it in. Never commit the real files (they are git-ignored).
   - Root `.env`: `OPENAI_API_KEY` and `OPENAI_MODEL` (see `.env.example`)
   - `api/.env`: from `api/.env.example` (`DATABASE_URL`, `JWT_SECRET`, `MODEL_SERVICE_INTERNAL_KEY`, ...)
   - `ai-service/.env`: `MODEL_SERVICE_INTERNAL_KEY=` (the same value as in `api/.env`)
   - `frontend/.env.local`: from `frontend/.env.local.example`
2. **API**
   ```
   cd api
   npm install
   npx prisma migrate deploy
   npm run db:seed            # demo farm: don@donsfarm.ng / password123 (local demos only)
   ```
3. **AI service**
   ```
   cd ai-service
   python -m venv .venv
   .venv\Scripts\pip install -r requirements.txt
   ```
4. **Frontend**: `cd frontend && npm install`

## Run (four terminals)

| What | Command | Port |
|---|---|---|
| AI service | `cd ai-service && .venv\Scripts\python -m uvicorn app.main:app --port 8001` | 8001 |
| API | `cd api && npm run dev` | 4000 |
| Frontend | `cd frontend && npm run dev -- --webpack` | 3000 |

Open http://localhost:3000. On the login page, **Use demo account** signs in as the seeded demo farmer.
(The frontend only needs `NEXT_PUBLIC_API_URL`; without it the app runs on built-in sample data.)

## Deploy

Step-by-step guide (GitHub, Neon database, Render for the API and AI service, Vercel for the website):
[`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md).

## Tests

```
cd ai-service && .venv\Scripts\python -m pytest -q       # 34 offline tests, no key needed
cd api && npm run typecheck
cd frontend && npx tsc --noEmit && npx eslint src
```

## Safety rules the code follows

- Public deployment is locked down: the AI service refuses to run without its internal key, the API refuses weak
  secrets, logins and chat are rate limited, and WhatsApp calls must carry Meta's signature.
- Git hooks (`.githooks/`, turn on with `git config core.hooksPath .githooks`) block commits that contain `.env`
  files, secret keys, or an AI tool listed as co-author.

- Never invent farm data or financial figures: answers come from stored records.
- Nothing is recorded without the farmer's explicit yes.
- Health output is decision support, never a diagnosis: no definite diagnoses, no drug doses, always a vet
  disclaimer, and a rule-based safety floor can only raise the risk the AI reports.
- One farmer can never read or change another farmer's farm.

## Known limits

- **The AI needs credit on the OpenAI account.** If it runs out, the app says the AI is unavailable and nothing is
  saved or invented. Keep an eye on the balance before a live demo.
- Replies to Pidgin messages are in Pidgin and to English messages in English. Voice transcription of Pidgin is
  implemented but not yet tested on real recordings.
- The WhatsApp webhook does not yet verify Meta's request signature, and WhatsApp itself is not connected yet.
- The login token is kept in `localStorage`. Move it to an httpOnly cookie before a public launch.
