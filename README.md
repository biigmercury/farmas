# FarmAs: Your AI Farm Companion

> Talk to your farm the way you talk. FarmAs turns everyday English and Nigerian Pidgin into farm records, answers
> your questions, checks animal health and warns you early when something looks wrong.

**Live app:** https://farmas-six.vercel.app
On the login page, tap **Use demo account** to explore a ready-made farm (Dons Farm, Kaduna State).

---

## Team

**Team name:** Team Imperials

**Team members**

- Oladepo Oluwaseyi Glory
- Muhammed Awwal Mumeenat
- Philips Olorunwa Edun
- Borokinni Yusuf Temitope

---

## The problem

Most small and medium livestock farmers in Nigeria keep their records in their heads or in a notebook. They do not
know their real profit, they spot a disease outbreak only when animals are already dying, and apps that ask for long
forms get abandoned. Farmers think and speak in English and Pidgin, not in spreadsheets.

## Our solution

**FarmAs lets a farmer simply talk to their farm.** They tell FarmAs AI what happened, by typing or by voice, and
FarmAs does the paperwork: it records the sale, updates the animal count, tracks the money and flags danger.

> "I don sell 20 birds for 75k" → FarmAs asks "Should I save this?" → the farmer says yes → the sale is recorded,
> the animal count goes down and Finance updates.

FarmAs AI has two modes on one screen:

| Mode | What it does |
|---|---|
| **Agent** | Understands what the farmer says and records it: sales, purchases, expenses, feed, deaths, lost animals and health problems. It always asks before saving, so a misheard number never changes the records. |
| **Chatbot** | Answers questions about animal care, feeding and disease from a veterinary knowledge base, and helps find the nearest vet. It never changes the records. |

### Features

- **Talk to record** in English or Nigerian Pidgin, with a switch to choose the reply language (Auto, English or Pidgin).
- **Voice notes**: record, check the written words, fix anything wrong, then send.
- **Conversation history**: past chats are saved and can be reopened. The AI remembers recent messages, so follow-up
  questions make sense.
- **Inventory**: live animal counts by type, with a history of every change (bought, sold, died, lost, added).
  Deaths reported to the AI come off the count automatically.
- **Health risk check**: describe symptoms (and add a photo) to get a risk level, possible concerns and safe next steps.
  A rule-based safety floor can raise the risk but never lower it, and every result says a vet must confirm.
- **Early warnings**: a mortality alert for recent deaths, health alerts, and task reminders such as vaccinations.
- **Finance**: revenue, expenses, profit and an expense breakdown, built from what the farmer tells the AI.
- **Dashboard**: a recent-activity table of sales, expenses, purchases and deaths.
- **Nearest vet**: with the farmer's permission, the app uses the phone's location to list nearby clinics, with call and
  directions buttons and a Google Maps search.

### Why it is safe to trust

- Nothing is recorded without the farmer's explicit yes.
- Answers about the farm come from stored records. FarmAs never invents numbers.
- Health output is decision support, not a diagnosis: no definite diagnoses, no drug doses, always a vet disclaimer.
- One farmer can never see or change another farmer's farm.
- Location and microphone are used only when the farmer taps the button and allows it. Location is not stored.

---

## How it works

```
Browser (Next.js, Vercel) ──► API (Node + Express + Prisma, Render) ──► AI service (FastAPI + OpenAI, Render)
                                        │
                                        └──► PostgreSQL (Neon)
```

| Folder | What it is |
|---|---|
| `frontend/` | Next.js website and app: landing page, sign up, onboarding, dashboard, AI chat, inventory, finance, health, tasks |
| `api/` | Node + Express + PostgreSQL (Prisma): login, farms, records, confirm-before-save, chat history, inventory |
| `ai-service/` | Python + FastAPI + OpenAI: understands messages, answers questions, assesses health, transcribes voice |
| `docs/` | API reference, API contract and the deployment guide |

The browser talks only to the API. The AI key lives only in the AI service, which also refuses requests that do not
carry the API's internal key. More detail: [`api/docs/API.md`](api/docs/API.md),
[`docs/API_CONTRACT.md`](docs/API_CONTRACT.md), [`ai-service/README.md`](ai-service/README.md).

**Built with:** Next.js 16, React 19, TypeScript, Tailwind CSS · Node, Express 5, Prisma, PostgreSQL (Neon) · Python,
FastAPI, OpenAI · Vercel and Render.

---

## Run it locally

You need Node 20+, Python 3.11+ and a PostgreSQL database (a free Neon project works).

1. **Secrets.** Copy each example file and fill it in. The real files are git-ignored and must never be committed.
   - Root `.env`: `OPENAI_API_KEY`, `OPENAI_MODEL` (see `.env.example`)
   - `api/.env`: from `api/.env.example` (`DATABASE_URL`, `JWT_SECRET`, `MODEL_SERVICE_INTERNAL_KEY`, ...)
   - `ai-service/.env`: `MODEL_SERVICE_INTERNAL_KEY=` (the same value as in `api/.env`)
   - `frontend/.env.local`: from `frontend/.env.local.example`
2. **API**
   ```
   cd api
   npm install
   npx prisma migrate deploy
   npm run db:seed        # creates the demo farm: don@donsfarm.ng / password123
   ```
3. **AI service**
   ```
   cd ai-service
   python -m venv .venv
   .venv\Scripts\pip install -r requirements.txt
   ```
4. **Frontend:** `cd frontend && npm install`

Then start the three parts:

| What | Command | Port |
|---|---|---|
| AI service | `cd ai-service && .venv\Scripts\python -m uvicorn app.main:app --port 8001` | 8001 |
| API | `cd api && npm run dev` | 4000 |
| Frontend | `cd frontend && npm run dev -- --webpack` | 3000 |

Open http://localhost:3000 and tap **Use demo account**. Without `NEXT_PUBLIC_API_URL`, the frontend runs on built-in
sample data.

## Deployment

The app runs on Vercel (website), Render (API and AI service) and Neon (database). Step by step:
[`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md).

Render's free plan puts a service to sleep after 15 minutes without visitors, so the first request after a quiet
spell can take up to a minute. A GitHub workflow (`.github/workflows/keep-alive.yml`) pings both services every
10 minutes to keep them awake.

## Tests

```
cd ai-service && .venv\Scripts\python -m pytest -q       # 40 offline tests, no API key needed
cd api && npm run typecheck
cd frontend && npx tsc --noEmit && npx eslint src
```

## What we would build next

- Connect WhatsApp so farmers can talk to FarmAs from the app they already use (the webhook is built and checks
  Meta's signature).
- A richer vet directory using Google Places, for more complete clinic names and phone numbers.
- Anomaly detection that spots unusual patterns in feed, mortality and sales before a farmer notices.
- Move the login token into a secure cookie for a public launch.
