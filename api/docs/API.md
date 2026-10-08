# FARMAS Backend — API Reference

FARMAS ("Your AI Farm Companion") is an AI-assisted farm operations platform for African smallholder farmers. It orchestrates an external ML microservice (NLU intent extraction, STT, animal-health triage) and exposes a REST API for both mobile/web apps and WhatsApp cloud messaging.

- **Base URL (local dev):** `http://localhost:4000`
- **Live health check:** `GET /healthz`
- **Auth:** Bearer JWT (`Authorization: Bearer <token>`)
- **Content-Type:** `application/json` (except `POST /health/assess` which is `multipart/form-data`)
- **Money:** amounts are returned as **numbers** (dashboard, dashboard-ish AI queries) or **strings for Prisma Decimal** (list endpoints like `/expenses`, `/sales`, `/batches`). Both represent Naira (NGN).

---

## Conventions

### Success envelope

```json
{
  "success": true,
  "data": { }
}
```

### Error envelope

```json
{
  "success": false,
  "error": {
    "message": "Human-readable message (sometimes in Nigerian Pidgin).",
    "code": "BAD_REQUEST"
  }
}
```

### Error codes

| HTTP | code             | When                                                    |
|------|------------------|---------------------------------------------------------|
| 400  | `BAD_REQUEST`    | Zod validation failed (`details[]` lists per-field errors) |
| 401  | `UNAUTHORIZED`   | Missing/invalid/expired bearer token                     |
| 403  | `FORBIDDEN`      | Tenant isolation — farm belongs to another user          |
| 404  | `NOT_FOUND`      | Route or resource not found                              |
| 429  | `RATE_LIMITED`   | API: 300 req/min/IP · Webhooks: 600 req/min/IP           |
| 500  | `INTERNAL_ERROR` | Unhandled failure                                        |

### Zod validation error example (`POST /api/auth/register` → `400`)

```json
{
  "success": false,
  "error": {
    "message": "Invalid request.",
    "code": "BAD_REQUEST",
    "details": [
      { "field": "name", "message": "Enter your full name." },
      { "field": "email", "message": "Enter a valid email address." },
      { "field": "phone", "message": "Enter a valid Nigerian phone number." },
      { "field": "password", "message": "Password suppose reach at least 8 characters." }
    ]
  }
}
```

---

## Endpoint summary

| Method | Path                                             | Auth | Body type | Section |
|--------|--------------------------------------------------|------|-----------|---------|
| GET    | `/healthz`                                       | no   | —         | [Health](#healthcheck) |
| POST   | `/api/auth/register`                             | no   | JSON      | [Auth](#authentication) |
| POST   | `/api/auth/login`                                | no   | JSON      | [Auth](#authentication) |
| GET    | `/api/auth/me`                                   | yes  | —         | [Auth](#authentication) |
| POST   | `/api/farms`                                     | yes  | JSON      | [Farms](#farms) |
| GET    | `/api/farms`                                     | yes  | —         | [Farms](#farms) |
| GET    | `/api/farms/:farmId`                             | yes* | —         | [Farms](#farms) |
| GET    | `/api/farms/:farmId/dashboard`                   | yes* | —         | [Dashboard](#dashboard) |
| GET    | `/api/farms/:farmId/alerts`                      | yes* | query     | [Alerts & Tasks](#alerts--tasks) |
| PATCH  | `/api/farms/:farmId/alerts/:alertId`             | yes* | JSON      | [Alerts & Tasks](#alerts--tasks) |
| GET    | `/api/farms/:farmId/tasks`                       | yes* | query     | [Alerts & Tasks](#alerts--tasks) |
| PATCH  | `/api/farms/:farmId/tasks/:taskId`               | yes* | JSON      | [Alerts & Tasks](#alerts--tasks) |
| GET    | `/api/farms/:farmId/livestock`                   | yes* | query     | [Livestock & Batches](#livestock--batches) |
| GET    | `/api/farms/:farmId/batches`                     | yes* | query     | [Livestock & Batches](#livestock--batches) |
| GET    | `/api/farms/:farmId/expenses`                    | yes* | query     | [Finance](#finance) |
| GET    | `/api/farms/:farmId/sales`                       | yes* | query     | [Finance](#finance) |
| POST   | `/api/farms/:farmId/ai/messages`                 | yes* | JSON      | [AI](#ai-farm-companion) |
| GET    | `/api/farms/:farmId/ai/actions/pending`          | yes* | —         | [AI](#ai-farm-companion) |
| POST   | `/api/farms/:farmId/ai/actions/:actionId/confirm`| yes* | JSON      | [AI](#ai-farm-companion) |
| POST   | `/api/farms/:farmId/health/assess`               | yes* | multipart | [Health Triage](#health-triage) |
| GET    | `/api/farms/:farmId/health/records`              | yes* | query     | [Health Triage](#health-triage) |
| GET    | `/webhooks/whatsapp`                             | no   | —         | [WhatsApp](#whatsapp-webhook) |
| POST   | `/webhooks/whatsapp`                             | no   | JSON      | [WhatsApp](#whatsapp-webhook) |

`yes*` = bearer token **plus** farm access: the farm must belong to you (403 otherwise).

---

## Healthcheck

### `GET /healthz`

- **Auth:** none
- Response `200`:

```json
{ "status": "ok", "service": "farmas-api", "uptime": 7.78 }
```

---

## Authentication

### `POST /api/auth/register`

Create a user. Phone numbers are normalized to E.164 (`0808...` → `234808...`).

**Body**

```json
{
  "name": "Adaeze Obi",
  "email": "adaeze@farm.ng",
  "phone": "08081234567",
  "password": "password123"
}
```

| field    | rules                                          |
|----------|------------------------------------------------|
| name     | required, 2–80 chars                           |
| email    | required, valid email                          |
| phone    | required, valid Nigerian number (accepts `0808…`, `+234…`, `234…`) |
| password | required, min 8 chars                          |

**Response `201`**

```json
{
  "success": true,
  "data": {
    "user": {
      "id": "cmuy6w2rc0000lgk8u3aza86g",
      "name": "Adaeze Obi",
      "email": "adaeze@farm.ng",
      "phone": "2348081234567",
      "role": "FARMER",
      "createdAt": "2026-10-07T14:15:04.440Z"
    },
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }
}
```

### `POST /api/auth/login`

Log in with email **or** phone.

**Body**

```json
{
  "identifier": "don@donsfarm.ng",
  "password": "password123"
}
```

**Response `200`**

```json
{
  "success": true,
  "data": {
    "user": {
      "id": "cmuy6oypy0000lg40y2wv122k",
      "name": "Don Emeka",
      "email": "don@donsfarm.ng",
      "phone": "2348031234567",
      "role": "FARMER",
      "createdAt": "2026-10-07T14:09:32.614Z"
    },
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }
}
```

Errors: `401` `UNAUTHORIZED` — bad credentials.

### `GET /api/auth/me`

- **Auth:** `Authorization: Bearer <token>`
- **Response `200`** — same `user` object as login (no token).

---

## Farms

### `POST /api/farms` — create a farm

**Body**

```json
{
  "name": "My New Farm",
  "location": "Oyo State, Nigeria",
  "farmType": "Poultry",
  "size": "2 hectares"
}
```

| field     | rules                                   |
|-----------|------------------------------------------|
| name      | required, 2–80 chars                     |
| location  | optional, ≤120 chars                     |
| farmType  | optional, ≤60 chars                      |
| size      | optional, ≤60 chars                      |

**Response `201`**

```json
{
  "success": true,
  "data": {
    "farm": {
      "id": "cmuy6oyqe0003lg40f20oljar",
      "ownerId": "cmuy6oypy0000lg40y2wv122k",
      "name": "My New Farm",
      "location": "Oyo State, Nigeria",
      "farmType": "Poultry",
      "size": "2 hectares",
      "createdAt": "2026-10-07T14:09:32.630Z",
      "updatedAt": "2026-10-07T14:09:32.630Z"
    }
  }
}
```

### `GET /api/farms` — list my farms

Admins see all farms; farmers see only their own.

**Response `200`** — `data.farms: Farm[]`.

### `GET /api/farms/:farmId` — get one farm

- **Auth + farm access required.**
- **Response `200`** — `data.farm: Farm` (same shape as create response).
- `403` if the farm belongs to another user.

---

## Dashboard

### `GET /api/farms/:farmId/dashboard`

Single call that powers the home screen. All amounts are **numbers** (NGN).

**Response `200`** (real example)

```json
{
  "success": true,
  "data": {
    "farm": { "id": "cmuy6oyqe0003lg40f20oljar", "name": "Dons Farm, Nigeria", "location": "Kaduna State, Nigeria" },
    "currency": "NGN",
    "totalLivestock": 545,
    "livestockByType": [
      { "type": "POULTRY", "quantity": 500 },
      { "type": "GOAT", "quantity": 30 },
      { "type": "SHEEP", "quantity": 15 }
    ],
    "animalsInActiveBatches": 545,
    "activeBatchCount": 3,
    "revenue": 695000,
    "revenueCount": 3,
    "expenses": 475000,
    "expenseCount": 5,
    "estimatedProfit": 220000,
    "activeAlertCount": 1,
    "activeAlerts": [
      {
        "id": "cmuy6oys40014lg40ypdg96cy",
        "type": "MORTALITY",
        "severity": "WARNING",
        "title": "High mortality in Broilers Batch A",
        "description": "21 mortalities recorded recently (4.2% of 500). Threshold na 3%. Abeg call your vet.",
        "createdAt": "2026-10-06T14:09:32.691Z"
      }
    ],
    "upcomingTasks": [
      {
        "id": "cmuy6oys00010lg40eqjhyc2i",
        "title": "Clean broiler pens",
        "dueDate": "2026-10-08T14:09:32.687Z",
        "category": "CLEANING",
        "status": "PENDING"
      }
    ],
    "generatedAt": "2026-10-07T14:15:04.813Z"
  }
}
```

---

## Alerts & Tasks

> **Note:** the alert engine generates `MORTALITY`, `FEED_DROP`, and `HEALTH_CLUSTER` alerts automatically from recorded activities.

### `GET /api/farms/:farmId/alerts`

**Query params**

| param  | type | default | notes                       |
|--------|------|---------|------------------------------|
| limit  | int  | 20      | 1–100                        |
| offset | int  | 0       | ≥ 0                          |

**Response `200`**

```json
{
  "success": true,
  "data": {
    "alerts": [
      {
        "id": "cmuy6oys40014lg40ypdg96cy",
        "farmId": "cmuy6oyqe0003lg40f20oljar",
        "type": "MORTALITY",
        "severity": "WARNING",
        "title": "High mortality in Broilers Batch A",
        "description": "21 mortalities recorded recently (4.2% of 500). Threshold na 3%. Abeg call your vet.",
        "status": "ACTIVE",
        "createdAt": "2026-10-06T14:09:32.691Z"
      }
    ],
    "total": 1,
    "limit": 20,
    "offset": 0
  }
}
```

### `PATCH /api/farms/:farmId/alerts/:alertId`

Mark an alert as resolved.

**Body**

```json
{ "status": "RESOLVED" }
```

`status`: `ACTIVE` | `RESOLVED`. **Response `200`** — `data.alert` (alert object, status updated). `404` if the alert belongs to another farm.

### `GET /api/farms/:farmId/tasks`

**Query params:** `limit`, `offset` (as above) plus optional `status` (`PENDING` | `DONE`).

**Response `200`**

```json
{
  "success": true,
  "data": {
    "tasks": [
      {
        "id": "cmuy6oys00010lg40eqjhyc2i",
        "farmId": "cmuy6oyqe0003lg40f20oljar",
        "title": "Clean broiler pens",
        "description": "Deep clean and disinfect",
        "dueDate": "2026-10-08T14:09:32.687Z",
        "category": "CLEANING",
        "status": "PENDING"
      }
    ],
    "total": 4,
    "limit": 20,
    "offset": 0
  }
}
```

### `PATCH /api/farms/:farmId/tasks/:taskId`

**Body**

```json
{ "status": "DONE" }
```

`status`: `PENDING` | `DONE`. **Response `200`** — `data.task` (updated). `404` if not on this farm.

---

## Livestock & Batches

### `GET /api/farms/:farmId/livestock`

**Query params:** `limit`, `offset`.

**Response `200`**

```json
{
  "success": true,
  "data": {
    "livestock": [
      {
        "id": "cmuy6oyqh0004lg40e5siekcb",
        "farmId": "cmuy6oyqe0003lg40f20oljar",
        "type": "POULTRY",
        "breed": "Cobb 500",
        "quantity": 500,
        "age": "6 weeks",
        "gender": null,
        "status": "ACTIVE",
        "createdAt": "2026-10-07T14:09:32.634Z",
        "updatedAt": "2026-10-07T14:09:32.634Z"
      }
    ],
    "total": 3,
    "limit": 20,
    "offset": 0
  }
}
```

`type` ∈ `POULTRY` | `GOAT` | `SHEEP` | `CATTLE`; `gender` ∈ `MALE` | `FEMALE` | `null`.

### `GET /api/farms/:farmId/batches`

**Query params:** `limit`, `offset`. Ordered by `purchaseDate` desc. **Note:** `purchaseCost` is a Prisma Decimal → string.

**Response `200`**

```json
{
  "success": true,
  "data": {
    "batches": [
      {
        "id": "cmuy6oyqo0008lg409dt0t832",
        "farmId": "cmuy6oyqe0003lg40f20oljar",
        "livestockType": "POULTRY",
        "name": "Broilers Batch A",
        "quantity": 500,
        "purchaseDate": "2026-08-26T14:09:32.637Z",
        "purchaseCost": "1150000",
        "status": "ACTIVE",
        "createdAt": "2026-10-07T14:09:32.640Z",
        "updatedAt": "2026-10-07T14:09:32.640Z"
      }
    ],
    "total": 3,
    "limit": 20,
    "offset": 0
  }
}
```

---

## Finance

### `GET /api/farms/:farmId/expenses`

**Query params:** `limit`, `offset`. Ordered by `date` desc. Includes `sumAmount` (all-time total, number).

**Response `200`** (`amount` is a Decimal → string)

```json
{
  "success": true,
  "data": {
    "expenses": [
      {
        "id": "cmuy6oyr3000dlg40117cromp",
        "farmId": "cmuy6oyqe0003lg40f20oljar",
        "batchId": "cmuy6oyqo0008lg409dt0t832",
        "category": "FEED",
        "amount": "185000",
        "currency": "NGN",
        "description": "Starter feed - 40 bags",
        "date": "2026-09-07T14:09:32.654Z",
        "createdAt": "2026-10-07T14:09:32.655Z",
        "updatedAt": "2026-10-07T14:09:32.655Z"
      }
    ],
    "total": 5,
    "sumAmount": 475000,
    "limit": 20,
    "offset": 0
  }
}
```

### `GET /api/farms/:farmId/sales`

**Query params:** `limit`, `offset`. Ordered by `date` desc. Includes `sumAmount`.

**Response `200`**

```json
{
  "success": true,
  "data": {
    "sales": [
      {
        "id": "cmuy6oyr7000ilg40balnefih",
        "farmId": "cmuy6oyqe0003lg40f20oljar",
        "batchId": "cmuy6oyqo0008lg409dt0t832",
        "livestockType": "POULTRY",
        "quantity": 50,
        "amount": "375000",
        "buyer": "Mallam Sani",
        "date": "2026-09-30T14:09:32.658Z",
        "createdAt": "2026-10-07T14:09:32.659Z",
        "updatedAt": "2026-10-07T14:09:32.659Z"
      }
    ],
    "total": 3,
    "sumAmount": 695000,
    "limit": 20,
    "offset": 0
  }
}
```

---

## AI Farm Companion

AI flows follow a **confirm-before-record** safety loop:

1. `POST .../ai/messages` → NLU extracts intent (via the ML microservice) → server proposes an action and stores it as `PENDING` in `AIActionLog` → returns a natural-language confirmation prompt.
2. Client reads `GET .../ai/actions/pending` to render/echo the proposal.
3. User says **yes** → `POST .../ai/actions/:actionId/confirm` with `confirmed: true` → server writes the real record (expense / sale / batch / feed / health) **inside a DB transaction** and adjusts inventory. User says **no** → `confirmed: false` → entry marked `REJECTED`, nothing recorded (follow-up log entry deletes the leftover pending).

Natural-language **queries** (sales, expenses, profit, livestock counts) never create pending actions — they are answered directly from real Prisma aggregations of the farm's data. If the ML microservice is unreachable, the API returns a friendly message ("AI service no dey available now abeg try again later") and records **no** fabricated data.

### `POST /api/farms/:farmId/ai/messages`

**Body**

```json
{ "text": "I buy 100 broilers for 300k today" }
```

| field | rules                     |
|-------|---------------------------|
| text  | required, 1–2000 chars    |

**Response `200` — action proposal (create intent)**

```json
{
  "success": true,
  "data": {
    "response": "I understood say you spent ₦300,000 on OTHER on 7 Oct 2026. Should I save this? Reply \"yes\" to confirm, or \"no\" to cancel."
  }
}
```

**Response `200` — direct query (no pending action)**

```json
{
  "success": true,
  "data": {
    "response": "For October 2026: Sales ₦195,000 (1) minus Expenses ₦385,000 (3). You dey spend pass wey you take gain — net na ₦-190,000."
  }
}
```

Other query examples:

- `"How much I spend this month?"` → `"For October 2026, you don spend ₦385,000 total across 3 expenses. Breakdown — Other: ₦300,000 (1), Labour: ₦60,000 (1), Utilities: ₦25,000 (1)."`
- `"How much I don sell?"` → `"For October 2026, sales don enter ₦195,000 from 1 sale. Breakdown — Poultry: ₦195,000 from 25 units (1 sale)."`
- `"How many animals I get?"` → `"You get 545 animals alive: 500 poultry, 30 goat, 15 sheep. Active batches: … Mortality wey don enter so far: 21 (from 2 health records)."`
- `"300 birds don kpai since morning, dem no dey eat"` → creates a pending **health** action with quantity/symptoms.

### `GET /api/farms/:farmId/ai/actions/pending`

Returns the newest unresolved proposal (or `action: null` when none).

**Response `200`**

```json
{
  "success": true,
  "data": {
    "action": {
      "id": "cmuy6w3em0002lgk8q3tgp9o0",
      "actionTaken": "Create Expense: you spent ₦300,000 on OTHER on 7 Oct 2026",
      "detectedIntent": "CREATE_EXPENSE",
      "confidence": 0.92,
      "confirmationStatus": "PENDING",
      "createdAt": "2026-10-07T14:15:05.278Z"
    }
  }
}
```

When none: `"action": null`.

### `POST /api/farms/:farmId/ai/actions/:actionId/confirm`

Only a `PENDING` action on this farm can be confirmed.

**Body**

```json
{ "confirmed": true }
```

| field     | rules            |
|-----------|------------------|
| confirmed | required boolean |

**Response `200` — confirmed**

```json
{
  "success": true,
  "data": {
    "response": "Done! I don save the expense of ₦300,000 for OTHER."
  }
}
```

**Response `200` — rejected**

```json
{
  "success": true,
  "data": {
    "response": "No wahala — I cancel am. Nothing don enter your record."
  }
}
```

`404` if the action id does not exist on this farm; `409` if it was already acted on.

---

## Health Triage

Sends symptoms (and optionally a photo + affected/mortality counts) to the ML health-assess endpoint. Always creates a `HealthRecord`, appends a vet-disclaimer, and escalates to an `HEALTH_CLUSTER` alert when the modelled risk is high. If the ML service is down, it still records the event with `assessmentUnavailable: true` and a pointer to talk to a vet (never fabricated risk).

### `POST /api/farms/:farmId/health/assess`

- **Content-Type:** `multipart/form-data`
- **Image upload:** single optional field `image`, max **8 MB**, `image/*` only.

| field           | type   | required | notes                                      |
|-----------------|--------|----------|---------------------------------------------|
| symptoms        | text   | yes      | free text symptoms (accepts Pidgin)         |
| numberAffected  | int    | yes      | ≥ 1                                         |
| mortality       | int    | no       | default 0                                   |
| image           | file   | no       | optional photo, 8 MB limit                  |
| vetRecommended  | bool   | no       | model hint (rarely used)                    |

**Response `201`** (real example)

```json
{
  "success": true,
  "data": {
    "healthRecordId": "cmuy6w3ol000mlgk83qtxikr1",
    "riskLevel": "MEDIUM",
    "requiresVetEscalation": false,
    "observations": [
      "Symptoms received and checked against common West African poultry and livestock conditions.",
      "No mortality signal detected."
    ],
    "possibleConcerns": ["Respiratory infection", "Heat stress", "Early infection"],
    "recommendedActions": ["Monitor feed and water intake", "Keep housing clean", "Re-assess in 24 hours"],
    "disclaimer": "FarmAs provides AI-assisted decision support and does not replace professional veterinary diagnosis.",
    "assessmentUnavailable": false,
    "text": "Risk level: MEDIUM\nObservations:\n- Symptoms received and checked against common West African poultry and livestock conditions.\n- No mortality signal detected.\nPossible concerns:\n- Respiratory infection\n- Heat stress\n- Early infection\nRecommended actions:\n- Monitor feed and water intake\n- Keep housing clean\n- Re-assess in 24 hours\n\nFarmAs provides AI-assisted decision support and does not replace professional veterinary diagnosis."
  }
}
```

`riskLevel` ∈ `LOW` | `MEDIUM` | `HIGH` | `CRITICAL`.

### `GET /api/farms/:farmId/health/records`

**Query params:** `limit`, `offset`. Ordered by `createdAt` desc.

**Response `200`**

```json
{
  "success": true,
  "data": {
    "records": [
      {
        "id": "cmuy6w3ol000mlgk83qtxikr1",
        "symptoms": "Some birds dey cough and no dey eat well",
        "observations": "Symptoms received and checked against common West African poultry and livestock conditions.",
        "numberAffected": 15,
        "mortality": 0,
        "riskLevel": "MEDIUM",
        "createdAt": "2026-10-07T14:15:05.430Z"
      }
    ],
    "total": 2,
    "limit": 20,
    "offset": 0
  }
}
```

---

## WhatsApp Webhook

Meta Cloud API posts events here. Voice notes are downloaded and transcribe-through-STT; **text messages** go through the same NLU as the app API, producing Pidgin confirmations that the farmer can answer with "yes" / "no" / "save am".

### `GET /webhooks/whatsapp` — verification

**Query params**

| param          | value                         |
|----------------|-------------------------------|
| hub.mode       | `subscribe`                   |
| hub.verify_token | `farmas-verify-token`       |
| hub.challenge  | any string                    |

- Valid → `200` with body = the `hub.challenge` value copied back as text.
- Invalid → `403`.

### `POST /webhooks/whatsapp` — inbound events

Accepts any Meta payload. **Acks immediately with `200` (empty body)** so Meta doesn't retry; processing happens asynchronously.

**Example body** (text message)

```json
{
  "object": "whatsapp_business_account",
  "entry": [
    {
      "id": "WHATSAPP_BUSINESS_ACCOUNT_ID",
      "changes": [
        {
          "value": {
            "messaging_product": "whatsapp",
            "metadata": {
              "display_phone_number": "15551234567",
              "phone_number_id": "WHATSAPP_PHONE_NUMBER_ID"
            },
            "contacts": [{ "profile": { "name": "Don Emeka" }, "wa_id": "2348031234567" }],
            "messages": [
              {
                "from": "2348031234567",
                "id": "wamid.example123",
                "timestamp": "1791380000",
                "type": "text",
                "text": { "body": "I sell 30 broilers for 300k" }
              }
            ]
          }
        }
      ]
    }
  ]
}
```

**Example body** (voice note — `type: "audio"`, plus `audio.id` in a second message object)

```json
{
  "object": "whatsapp_business_account",
  "entry": [
    {
      "changes": [
        {
          "value": {
            "metadata": { "phone_number_id": "WHATSAPP_PHONE_NUMBER_ID" },
            "contacts": [{ "profile": { "name": "Don Emeka" }, "wa_id": "2348031234567" }],
            "messages": [
              { "from": "2348031234567", "id": "wamid.audio1", "timestamp": "1791380000", "type": "audio" },
              { "from": "2348031234567", "id": "wamid.audio2", "timestamp": "1791380001", "type": "audio", "audio": { "id": "9146787809408123" } }
            ]
          }
        }
      ]
    }
  ]
}
```

**Async processing behavior**

- Sender phone is resolved to a registered user (E.164 match). Unknown numbers are ignored.
- Text/audio is routed through NLU/STT. Create-intents become `PENDING` actions and the farmer gets a Pidgin confirmation prompt.
- A **"yes" / "no" / "save am"** text reply confirms/rejects the pending action without re-running the ML.
- Replies are sent back through the Graph API. If `WHATSAPP_TOKEN`/`WHATSAPP_PHONE_NUMBER_ID` are not configured, replies are logged and skipped (webhook still acks `200`).

---

## Runbook (local dev)

```bash
npm run db:migrate   # apply migrations
npm run db:seed      # seed demo "Dons Farm, Nigeria" data
npm run mock:ml      # start mock ML microservice (port 8001)
npm run dev          # start API (port 4000)
npm run typecheck
npm run build && npm start   # production path
```

**Demo credentials**

- Farmer: `don@donsfarm.ng` / `password123` (WhatsApp phone `2348031234567`)
- Admin: `admin@farmas.africa` / `admin1234`
- Farm id: `cmuy73z7w0003lgl83fx6ktya` (changes on every re-seed — fetch it from `GET /api/farms`)

**Environment** (`.env`): `DATABASE_URL`, `JWT_SECRET`, `JWT_EXPIRES_IN`, `ML_BASE_URL=http://localhost:8001`, `ML_INTERNAL_KEY`, `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_VERIFY_TOKEN=farmas-verify-token`. See `.env.example`.