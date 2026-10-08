# FarmAs AI service

The AI brain behind the Node API (`../api`). It runs on **OpenAI** and exposes three endpoints:

| Endpoint | In | Out |
|---|---|---|
| `POST /nlu/extract` | `{ "text": "...", "context": {...} }` | `{ intent, confidence, language, entities }` |
| `POST /health/assess` | form: `symptoms` + optional `species`, `number_affected`, `total`, `mortality`, `onset`, `drinking`, `vaccinated`, `image` | risk level, observations, possible concerns, actions, vet escalation |
| `POST /stt/transcribe` | form: `file` (ogg / webm / mp3 / wav / m4a) | `{ "transcription": "..." }` |

It never writes farm records. The API asks the farmer to confirm before anything is saved.

## Safety design

- Health answers use retrieved veterinary excerpts (`knowledge/`, from Glory's work) and the prompt forbids
  diagnoses, drug doses and home recipes.
- A rule-based **safety floor** can only *raise* the model's risk level (deaths, red-flag signs, a named
  notifiable disease). The model can never under-rate a dangerous case.
- The disclaimer is fixed in code, not written by the model.

## Run

```
python -m venv .venv
.venv\Scripts\pip install -r requirements.txt
.venv\Scripts\python -m uvicorn app.main:app --port 8001
```

Settings come from `.env` (here or in the repo root). Never commit it.

| Variable | Meaning |
|---|---|
| `OPENAI_API_KEY` | Your OpenAI key |
| `OPENAI_MODEL` | Defaults to `gpt-6-luna` |
| `OPENAI_FALLBACK_MODELS` | Backups if the main model is busy. Default `gpt-5.4-mini,gpt-4.1-mini` |
| `OPENAI_STT_MODEL` | Speech to text. Default `gpt-4o-transcribe` |
| `MODEL_SERVICE_INTERNAL_KEY` | If set, callers must send it as `X-Internal-Key` |

## Test

```
.venv\Scripts\python -m pytest -q          # offline, no key needed
.venv\Scripts\python scripts\live_smoke.py # uses your real key: a few real OpenAI calls
```

## Credits

Knowledge base and retriever: Glory. Anomaly-detection ideas for later: Mhimi.
