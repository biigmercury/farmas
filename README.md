# FarmAs: Your AI Farm Companion

**Live app:** https://farmas-six.vercel.app (on the login page, tap **Use demo account**)

## Team

**Team name:** Team Imperials

**Team members**

- Oladepo Oluwaseyi Glory
- Muhammed Awwal Mumeenat
- Philips Edun
- Borokinni Yusuf Temitope

## Our solution

Most small and medium livestock farmers in Nigeria keep their records in their heads or in a notebook. They do not
know their real profit, they notice a disease outbreak when it is already too late, and apps that ask them to fill in
long forms get abandoned.

**FarmAs lets a farmer simply talk to their farm.** They tell FarmAs AI what happened, in English or Nigerian Pidgin,
by typing or by voice. FarmAs turns it into a proper farm record, answers questions from the farmer's own data, checks
animal health, and warns early when something looks wrong.

> "I don sell 20 birds for 75k" → FarmAs asks "Should I save this?" → the farmer says yes → the sale is in the records,
> the animal count goes down and Finance updates.

### What it does

- **Agent mode: talk to record.** Sales, purchases, expenses, feed, deaths and health problems are understood from
  plain messages. Nothing is saved until the farmer confirms. Dead animals leave the available count automatically.
- **Chatbot mode: ask anything.** General questions about animal care, feeding and diseases are answered from a
  veterinary knowledge base, in simple English or Pidgin. It never changes the farm records.
- **Nearest vet.** When a farmer asks for a vet, the app uses their phone's location (only if they allow it) to list
  the closest clinics from OpenStreetMap, with call and directions buttons.
- **Voice notes.** Record, see the words, fix anything wrong, then send.
- **Conversation history.** Past chats are saved per farm and can be reopened, and the AI remembers recent messages.
- **Health risk check.** Describe symptoms (and add a photo) to get a risk level, possible concerns and safe next
  steps. A rule-based safety floor can raise the risk, never lower it, and it always says a vet must confirm.
- **Inventory, finance and early warnings.** Live animal counts with a history of every change, revenue, expenses and
  profit, a mortality alert, task reminders, and a table of recent activity.
- **Pidgin or English**, chosen automatically or by the farmer.

### Built with

Next.js and React (website), Node, Express, Prisma and PostgreSQL on Neon (API), Python and FastAPI with OpenAI
(AI service), deployed on Vercel and Render.

## How it fits together

```
frontend/    Next.js app: landing page, sign up, onboarding, dashboard, AI chat, inventory, health, tasks
api/         Node + Express + Postgres (Prisma): login, farms, records, confirm-before-save, chat history, WhatsApp webhook
ai-service/  Python + FastAPI + OpenAI: understands messages, answers questions, assesses health, transcribes voice
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

## Run (three terminals)

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

Render's free plan puts a service to sleep after 15 minutes without visitors. The workflow in
`.github/workflows/keep-alive.yml` pings both services every 10 minutes to keep them awake. GitHub can run it a few
minutes late, so open the app a minute before a live demo.

## Tests

```
cd ai-service && .venv\Scripts\python -m pytest -q       # 40 offline tests, no key needed
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
- The nearest-vet list only shows clinics found in map data. It never invents one.
- Location and microphone are only used when the farmer taps the button and allows it. Location is not stored.
- One farmer can never read or change another farmer's farm.

## Known limits

- **The AI needs credit on the OpenAI account.** If it runs out, the app says the AI is unavailable and nothing is
  saved or invented. Keep an eye on the balance before a live demo.
- Voice transcription works, but has only been tested on synthetic speech, not yet on real Pidgin recordings.
- Vet clinics come from OpenStreetMap, which has few clinics tagged in some Nigerian areas. A Google Maps search
  button is always offered as well.
- WhatsApp is not connected yet (the webhook code is ready and checks Meta's signature).
- The login token is kept in `localStorage`. Move it to an httpOnly cookie before a public launch.
