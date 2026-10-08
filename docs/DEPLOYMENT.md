# Deploying FarmAs

Follow the steps in order. Total time: about 60 to 90 minutes the first time.

## What goes where

```
Visitors ──► Vercel         (the website: frontend/)
                │
                ▼
             Render         (the API: api/)  ───►  Neon         (database)
                │
                ▼
             Render         (the AI service: ai-service/)  ───►  OpenAI
```

| Piece | Host | Why |
|---|---|---|
| Website (`frontend/`) | **Vercel** | Made for Next.js. No configuration needed. |
| API (`api/`) | **Render** | Runs a normal Node server. |
| AI service (`ai-service/`) | **Render** | Runs a normal Python server. |
| Database | **Neon** | Free hosted PostgreSQL. |

**Vercel or Cloudflare?** Use **Vercel** for the website. Cloudflare can host Next.js too, but it needs an extra
adapter and more setup, for no benefit here. More importantly, Cloudflare's server platform cannot run the API
(Express + Prisma) or the Python AI service without rewriting them, so you would still need Render. You can put
Cloudflare in front later for a custom domain (see step 9).

> Prices and free-tier limits change. Check each host's pricing page before you rely on a free plan.

You need accounts at: **GitHub, Neon, Render, Vercel**, and an **OpenAI** account with credit.

---

## Step 1. Put the code in a new GitHub repository (clean history, no AI co-author)

Everything here runs in PowerShell. Close any running dev servers first.

**1.1. Start a fresh git history.** This deletes only the *old local* git history, not your files and not the old
GitHub repo.

```powershell
cd "C:\My Projects\FarmAs"
Remove-Item -Recurse -Force .git
git init -b main
```

**1.2. Set your identity for this project.** Use your own name. For the email, use the private address GitHub gives
you (GitHub, then Settings, then Emails, then "Keep my email addresses private"; it looks like
`12345678+yourusername@users.noreply.github.com`).

```powershell
git config user.name "Your Name"
git config user.email "12345678+yourusername@users.noreply.github.com"
```

**1.3. Turn on the safety hooks.** They **block** any commit that credits an AI tool as co-author, and any commit
that contains a `.env` file or something that looks like a secret key.

```powershell
git config core.hooksPath .githooks
```

**1.4. (Recommended) Leave out the old prototype folders.** They are Glory's first version. Its knowledge base
already lives in `ai-service/knowledge/`. They still exist in the old repo.

```powershell
Remove-Item -Recurse -Force backend, chatbot, chat_ui, knowledge
```

**1.5. Check what will be committed.** Nothing secret should appear.

```powershell
git add .
git status --short
git ls-files | Select-String -Pattern "\.env"
```

The last command must list **only** `.example` files (for example `api/.env.example`). If you see a plain `.env`,
stop and tell someone before going further.

**1.6. Make the first commit.**

```powershell
git commit -m "Initial commit: FarmAs, your AI farm companion"
```

If you want to credit teammates, add a line per person using their real GitHub noreply emails:

```powershell
git commit -m "Initial commit: FarmAs, your AI farm companion" -m "Co-authored-by: Glory <ID+username@users.noreply.github.com>"
```

**1.7. Prove nobody unexpected is in the history.**

```powershell
git log --format="%an <%ae>"
git shortlog -sne --all
git log --all -i --grep="claude" --grep="anthropic"
```

You should see only your name (and teammates you added). The last command must print nothing.

**1.8. Create the empty repository on GitHub.** Go to https://github.com/new, name it, choose Private or Public,
and **do not** tick "Add a README", ".gitignore" or "license". Then push:

```powershell
git remote add origin https://github.com/YOUR-USERNAME/YOUR-REPO.git
git push -u origin main
```

**1.9. Check GitHub after pushing.**
- The repo page, **Contributors** box: only you (and teammates you added). It can take a few minutes to update.
- **Settings, Collaborators**: only people you invited. Do not invite anyone else.
- https://github.com/settings/installations and https://github.com/settings/applications : if anything named
  Claude or Anthropic is listed, revoke it. An app installed on your account is one way a tool can show up as a
  contributor.

---

## Step 2. Create the database (Neon)

1. Sign up at https://neon.tech and create a project (pick the region closest to your users).
2. On the project dashboard open **Connection details**. **Turn "Connection pooling" off** and copy the connection
   string. It looks like `postgresql://user:password@ep-xxxx.region.aws.neon.tech/neondb?sslmode=require`.
   Keep it private. It is your `DATABASE_URL`.
3. Create the tables, from your PC (use your real string):

```powershell
cd "C:\My Projects\FarmAs\api"
npm ci
$env:DATABASE_URL = "PASTE-THE-NEON-STRING-HERE"
npx prisma migrate deploy
```

You should see "All migrations have been successfully applied".

4. (Optional, for demos) load the sample farm "Dons Farm":

```powershell
npm run db:seed
```

This only touches the two demo accounts it creates. It never wipes other data. Its login is
`don@donsfarm.ng` / `password123`, and is public knowledge, so keep it for demos only.

---

## Step 3. Make your secrets

Run this **twice** and keep both results somewhere private (a password manager, not the repo):

```powershell
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

- First result = `JWT_SECRET` (signs login tokens).
- Second result = `MODEL_SERVICE_INTERNAL_KEY` (the password between the API and the AI service; the **same** value goes in both).

---

## Step 4. Deploy the AI service (Render)

1. https://render.com, then **New**, then **Web Service**, and connect your GitHub repo.
2. Settings:

| Setting | Value |
|---|---|
| Name | `farmas-ai` (any name) |
| Root Directory | `ai-service` |
| Runtime / Language | Python 3 |
| Build Command | `pip install -r requirements.txt` |
| Start Command | `uvicorn app.main:app --host 0.0.0.0 --port $PORT` |
| Health Check Path | `/healthz` |

3. **Environment variables** (Advanced section):

| Name | Value |
|---|---|
| `AI_SERVICE_ENV` | `production` |
| `OPENAI_API_KEY` | your OpenAI key |
| `OPENAI_MODEL` | `gpt-6-luna` |
| `MODEL_SERVICE_INTERNAL_KEY` | the second secret from step 3 |

4. Deploy. When it is live, open `https://YOUR-AI-NAME.onrender.com/healthz`. You should see
   `"status":"ok"` and `"ai_key_configured":true`. Copy this web address; you need it next.

If the build fails because of the Python version, add an environment variable `PYTHON_VERSION` set to a version
Render lists as supported (3.12 or newer works with this code).

---

## Step 5. Deploy the API (Render)

1. **New**, then **Web Service**, same repo.
2. Settings:

| Setting | Value |
|---|---|
| Name | `farmas-api` |
| Root Directory | `api` |
| Runtime / Language | Node |
| Build Command | `npm ci --include=dev && npm run build` |
| Start Command | `npx prisma migrate deploy && npm start` |
| Health Check Path | `/healthz` |

(`--include=dev` is needed because the build tools are development packages. The start command applies any new
database changes automatically each time you deploy.)

3. **Environment variables:**

| Name | Value |
|---|---|
| `NODE_ENV` | `production` |
| `DATABASE_URL` | the Neon string from step 2 |
| `JWT_SECRET` | the first secret from step 3 |
| `MODEL_SERVICE_URL` | the AI service address from step 4, for example `https://farmas-ai.onrender.com` |
| `MODEL_SERVICE_INTERNAL_KEY` | the second secret from step 3 (identical to the AI service) |
| `FRONTEND_ORIGIN` | `https://placeholder.example` for now (fixed in step 7) |

Leave the `WHATSAPP_*` variables empty until you connect WhatsApp. The API refuses to start with weak or missing
secrets and tells you exactly which one in the deploy log.

4. Deploy, then open `https://YOUR-API-NAME.onrender.com/healthz`. You should see `"status":"ok"`. Copy this address.

---

## Step 6. Deploy the website (Vercel)

1. https://vercel.com, then **Add New**, then **Project**, and import the GitHub repo.
2. **Root Directory: `frontend`** (click Edit next to it). Framework: Next.js (detected automatically). Leave the
   build settings as they are.
3. **Environment Variables** (these are built into the site, so set them **before** the first deploy):

| Name | Value |
|---|---|
| `NEXT_PUBLIC_API_URL` | the API address from step 5 (must start with `https://`) |
| `NEXT_PUBLIC_DEMO_EMAIL` | `don@donsfarm.ng` (optional: shows the "Use demo account" button) |
| `NEXT_PUBLIC_DEMO_PASSWORD` | `password123` (optional, same) |

The two demo variables are **public**: anyone can read them in the website. Only use them with the throwaway
demo farm, and delete both for a real public launch.

4. Deploy. Copy the website address, for example `https://farmas-xyz.vercel.app`.

---

## Step 7. Let the website talk to the API

The API only accepts browser calls from websites you name.

1. In Render, open `farmas-api`, then **Environment**.
2. Change `FRONTEND_ORIGIN` to your Vercel address with no trailing slash, for example
   `https://farmas-xyz.vercel.app`. For several addresses (like a custom domain too), separate them with commas.
3. Save. Render redeploys the API.

> Vercel "preview" deployments get different addresses and will be blocked until you add them. Production
> addresses are fine.

---

## Step 8. Check that everything works

Open your Vercel address and go through this:

1. The landing page loads and the video plays.
2. **Start your farm**, create an account, finish the 3 onboarding steps, and land on the dashboard.
3. Open **FarmAs AI** and type `I sold 5 birds for 20k`. You should see a "Should I save this?" question.
   Tap **Yes, save**. Then open **Finance** and see ₦20,000 of revenue.
4. Type `Abeg how much I don spend this month?`. You get an answer in Pidgin from your own records.
5. Open **Health**, describe symptoms, and get a risk level.
6. Log out, then **Use demo account** (if you set the demo variables) opens Dons Farm.

If a step fails, see Troubleshooting below.

**Before a live demo:**
- Render's free plans put a service to sleep after a period with no traffic, and the first visit then takes about
  a minute. Open the site and send one chat message 5 minutes before you present, or use a paid plan so it never sleeps.
- Check your OpenAI balance. In the OpenAI dashboard, set a monthly spending limit so a bug or abuse can never cost more than you chose.

---

## Step 9. Optional: your own domain

- Buy a domain, add it in Vercel (Project, Settings, Domains) and follow its DNS instructions.
- Add the new `https://...` address to `FRONTEND_ORIGIN` on the API (comma separated).
- If you put Cloudflare in front of the **API**, set `TRUST_PROXY_HOPS` to `2` on the API so rate limits still
  see the real visitor.

## Step 10. Later: WhatsApp

1. In the Meta developer dashboard set the webhook URL to `https://YOUR-API.onrender.com/webhooks/whatsapp`
   and the verify token to the value of `WHATSAPP_VERIFY_TOKEN`.
2. On the API set `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID` and **`WHATSAPP_APP_SECRET`** (the app secret from
   Meta). Without the app secret the API rejects every WhatsApp call on purpose, so nobody can fake a message.
3. The farmer's WhatsApp number must match the phone number on their FarmAs account.

---

## Troubleshooting

| What you see | Likely cause and fix |
|---|---|
| Browser console says **CORS** / "blocked by CORS policy" | `FRONTEND_ORIGIN` on the API doesn't exactly match the website address (check `https`, no trailing `/`). Fix it and let the API redeploy. |
| The site says "Can't reach the server" | `NEXT_PUBLIC_API_URL` is wrong, or the API is asleep (wait a minute and retry). After changing a `NEXT_PUBLIC_` value you must **redeploy** the website. |
| API deploy fails: "Unsafe production configuration" | The log lists the problem: a short or placeholder `JWT_SECRET`, a missing `MODEL_SERVICE_INTERNAL_KEY`, an `http://` origin, or `DATABASE_URL` pointing at localhost. |
| API deploy fails during build: "tsc: not found" | The build command is missing `--include=dev`. Use `npm ci --include=dev && npm run build`. |
| Chat says "Our AI service is not responding" | Check, in order: the AI service is running; `MODEL_SERVICE_URL` is right; the internal key is identical in both services; the OpenAI account has credit. The AI service log shows the exact reason. |
| AI service log: "out of credit" | Add credit to the OpenAI account. |
| Logged out again and again | `JWT_SECRET` changed between deploys, or the browser blocks storage. Log in again. |
| "Too many requests" | A rate limit protecting your OpenAI bill (30 chat messages per minute per farmer, 10 health checks per minute). It clears in a minute. |
| Database errors about SSL | Keep `?sslmode=require` at the end of `DATABASE_URL`. |

## Keeping secrets safe

- Real keys live **only** in the hosts' dashboards (and your private `.env` files). Never in the repo, chat, or screenshots.
- If a key is ever exposed, make a new one and delete the old one right away (OpenAI dashboard, Render, or regenerate the secrets in step 3).
- `NEXT_PUBLIC_*` values are visible to everyone who opens the website.
