"""Offline tests: the AI is replaced by a fake, so nothing here needs a key or the internet."""
import pytest
from fastapi.testclient import TestClient

from app import ai_client, config, health, nlu, stt
from app.main import app

client = TestClient(app)


@pytest.fixture(autouse=True)
def _isolate_from_local_env(monkeypatch):
    """Tests must behave the same on every machine, whatever is in anyone's local .env."""
    monkeypatch.setattr(config, "INTERNAL_KEY", "")
    monkeypatch.setattr(config, "OPENAI_API_KEY", "test-key-not-used")


# ---------- safety floor -------------------------------------------------------------------

def floor(**kw):
    return health.safety_floor(health.HealthInput(symptoms=kw.pop("symptoms", "coughing"), **kw))


def test_floor_mild_case_is_low():
    assert floor(number_affected=1, total=100, mortality=0, drinking="normal") == ("LOW", False)


def test_floor_deaths_and_red_flags_are_high():
    risk, vet = floor(symptoms="gasping for air", number_affected=12, total=500, mortality=3, drinking="less")
    assert risk == "HIGH" and vet is True


def test_floor_names_a_notifiable_disease_forces_high():
    assert floor(symptoms="I think it is newcastle", number_affected=1) == ("HIGH", True)


def test_floor_pidgin_deaths_count_as_red_flag():
    risk, _ = floor(symptoms="plenty don kpai since morning", number_affected=20, mortality=5)
    assert risk == "HIGH"


# ---------- assessment never goes below the floor ------------------------------------------

def _fake_assessment(risk="LOW", disclaimer="I made this up"):
    return health.Assessment(
        risk_level=risk, observations=["a"] * 9, possible_concerns=["b"] * 9, recommended_actions=["c"] * 9,
        requires_vet_escalation=False, disclaimer=disclaimer,
    )


def test_assess_raises_a_too_low_model_answer(monkeypatch):
    monkeypatch.setattr(ai_client, "generate_structured", lambda **kw: _fake_assessment("LOW"))
    h = health.HealthInput(symptoms="gasping, birds dey die", number_affected=15, total=100, mortality=4)
    out = health.assess(h)
    assert out.risk_level == "HIGH"
    assert out.requires_vet_escalation is True


def test_assess_forces_disclaimer_and_trims_lists(monkeypatch):
    monkeypatch.setattr(ai_client, "generate_structured", lambda **kw: _fake_assessment("MEDIUM"))
    out = health.assess(health.HealthInput(symptoms="a cough", number_affected=1))
    assert out.disclaimer == health.DISCLAIMER
    assert len(out.observations) == 5 and len(out.possible_concerns) == 4 and len(out.recommended_actions) == 5


def test_assess_keeps_a_higher_model_answer(monkeypatch):
    monkeypatch.setattr(ai_client, "generate_structured", lambda **kw: _fake_assessment("HIGH"))
    assert health.assess(health.HealthInput(symptoms="a cough", number_affected=1)).risk_level == "HIGH"


def test_prompt_includes_retrieved_knowledge(monkeypatch):
    seen = {}

    def fake(**kw):
        seen.update(kw)
        return _fake_assessment("LOW")

    monkeypatch.setattr(ai_client, "generate_structured", fake)
    health.assess(health.HealthInput(symptoms="my broilers no dey chop and dey stool water", species="poultry"))
    assert "KNOWLEDGE EXCERPTS" in seen["prompt"]
    assert "poultry" in seen["prompt"].lower()


# ---------- NLU ----------------------------------------------------------------------------

def test_nlu_sends_date_and_text_and_returns_model_result(monkeypatch):
    seen = {}

    def fake(**kw):
        seen.update(kw)
        return nlu.NluResult(
            intent="CREATE_SALE", confidence=0.95, language="pidgin",
            entities=nlu.Entities(quantity=20, amount=75000, livestock_type="POULTRY"),
        )

    monkeypatch.setattr(ai_client, "generate_structured", fake)
    r = nlu.extract("I don sell 20 birds for 75k", {"current_date": "2026-10-08T10:00:00Z"})
    assert r.intent == "CREATE_SALE" and r.entities.amount == 75000
    assert "CURRENT_DATE: 2026-10-08" in seen["prompt"]
    assert "I don sell 20 birds for 75k" in seen["prompt"]


def test_nlu_endpoint_returns_503_when_ai_is_down(monkeypatch):
    def boom(**kw):
        raise ai_client.AiUnavailable("no key")

    monkeypatch.setattr(ai_client, "generate_structured", boom)
    r = client.post("/nlu/extract", json={"text": "hello"})
    assert r.status_code == 503


def test_nlu_endpoint_rejects_empty_text():
    assert client.post("/nlu/extract", json={"text": ""}).status_code == 422


# ---------- internal key -------------------------------------------------------------------

def test_internal_key_is_enforced_when_set(monkeypatch):
    monkeypatch.setattr(config, "INTERNAL_KEY", "secret-123")
    assert client.post("/nlu/extract", json={"text": "hi"}).status_code == 401
    assert client.post("/nlu/extract", json={"text": "hi"}, headers={"X-Internal-Key": "wrong"}).status_code == 401

    monkeypatch.setattr(
        ai_client, "generate_structured",
        lambda **kw: nlu.NluResult(intent="UNKNOWN", confidence=0.1, language="english", entities=nlu.Entities()),
    )
    ok = client.post("/nlu/extract", json={"text": "hi"}, headers={"X-Internal-Key": "secret-123"})
    assert ok.status_code == 200 and ok.json()["intent"] == "UNKNOWN"


# ---------- speech to text -----------------------------------------------------------------

def test_stt_mime_normalising():
    assert stt.normalize_mime("audio/ogg; codecs=opus") == "audio/ogg"
    assert stt.normalize_mime("audio/opus") == "audio/ogg"
    assert stt.normalize_mime("application/octet-stream", "note.ogg") == "audio/ogg"
    assert stt.normalize_mime("application/pdf", "x.pdf") == ""


def test_stt_endpoint_returns_transcript(monkeypatch):
    monkeypatch.setattr(ai_client, "transcribe", lambda **kw: "I don buy 100 birds")
    r = client.post("/stt/transcribe", files={"file": ("n.ogg", b"fakeaudio", "audio/ogg")})
    assert r.status_code == 200 and r.json() == {"transcription": "I don buy 100 birds"}


def test_stt_no_speech_becomes_empty(monkeypatch):
    monkeypatch.setattr(ai_client, "transcribe", lambda **kw: "")
    r = client.post("/stt/transcribe", files={"file": ("n.ogg", b"x", "audio/ogg")})
    assert r.json() == {"transcription": ""}


def test_stt_rejects_wrong_type_and_empty_file():
    assert client.post("/stt/transcribe", files={"file": ("a.pdf", b"x", "application/pdf")}).status_code == 400
    assert client.post("/stt/transcribe", files={"file": ("a.ogg", b"", "audio/ogg")}).status_code == 400


# ---------- health endpoint ----------------------------------------------------------------

def test_health_endpoint_validates_and_returns(monkeypatch):
    monkeypatch.setattr(ai_client, "generate_structured", lambda **kw: _fake_assessment("LOW"))
    ok = client.post("/health/assess", data={"symptoms": "coughing", "number_affected": "2", "species": "goats"})
    assert ok.status_code == 200 and ok.json()["risk_level"] in {"LOW", "MEDIUM", "HIGH"}
    assert ok.json()["disclaimer"] == health.DISCLAIMER
    assert client.post("/health/assess", data={"symptoms": "x"}).status_code == 422  # too short
    bad = client.post(
        "/health/assess", data={"symptoms": "coughing"}, files={"image": ("a.txt", b"hi", "text/plain")}
    )
    assert bad.status_code == 400


def test_healthz_reports_knowledge_loaded():
    body = client.get("/healthz").json()
    assert body["status"] == "ok" and body["knowledge_chunks"] > 0


# ---------- resilience: retry, then fall back to another model ------------------------------

class _Err(Exception):
    def __init__(self, code):
        super().__init__(f"error {code}")
        self.code = code


def test_transient_error_is_retried_then_succeeds(monkeypatch):
    monkeypatch.setattr(ai_client.time, "sleep", lambda s: None)
    calls = []

    def make(model, timeout=None):
        calls.append(model)
        if len(calls) < 3:
            raise _Err(503)
        return "ok"

    assert ai_client._call_with_fallback(make) == "ok"
    assert len(set(calls)) == 1  # stayed on the main model


def test_overloaded_main_model_falls_back_to_next(monkeypatch):
    monkeypatch.setattr(ai_client.time, "sleep", lambda s: None)
    monkeypatch.setattr(config, "OPENAI_MODEL", "main-model")
    monkeypatch.setattr(config, "OPENAI_FALLBACK_MODELS", ["backup-model"])
    seen = []

    def make(model, timeout=None):
        seen.append(model)
        if model == "main-model":
            raise _Err(503)
        return "from-backup"

    assert ai_client._call_with_fallback(make) == "from-backup"
    assert seen[0] == "main-model" and seen[-1] == "backup-model"


def test_non_transient_error_is_not_retried(monkeypatch):
    monkeypatch.setattr(ai_client.time, "sleep", lambda s: None)
    calls = []

    def make(model, timeout=None):
        calls.append(model)
        raise _Err(404)

    with pytest.raises(_Err):
        ai_client._call_with_fallback(make)
    assert len(calls) == 1


def test_network_timeouts_count_as_transient():
    class ReadTimeout(Exception):
        pass

    wrapped = RuntimeError("outer")
    wrapped.__cause__ = ReadTimeout("slow network")
    assert ai_client._is_transient(ReadTimeout())
    assert ai_client._is_transient(wrapped)
    assert not ai_client._is_transient(ValueError("bad input"))


def test_quota_exhausted_skips_waiting_and_uses_next_model(monkeypatch):
    slept = []
    monkeypatch.setattr(ai_client.time, "sleep", lambda s: slept.append(s))
    monkeypatch.setattr(config, "OPENAI_MODEL", "main-model")
    monkeypatch.setattr(config, "OPENAI_FALLBACK_MODELS", ["backup-model"])
    seen = []

    def make(model, timeout=None):
        seen.append(model)
        if model == "main-model":
            raise _Err(429)
        return "ok"

    assert ai_client._call_with_fallback(make) == "ok"
    assert seen == ["main-model", "backup-model"]  # one try on the exhausted model, no retries
    assert slept == []


class _QuotaErr(Exception):
    code = 429

    def __init__(self, secs):
        super().__init__(f"You exceeded your quota. Please retry in {secs}s.")


def test_all_models_out_of_quota_waits_for_the_window_then_succeeds(monkeypatch):
    slept = []
    monkeypatch.setattr(ai_client.time, "sleep", lambda s: slept.append(s))
    monkeypatch.setattr(config, "OPENAI_MODEL", "a")
    monkeypatch.setattr(config, "OPENAI_FALLBACK_MODELS", ["b"])
    state = {"calls": 0}

    def make(model, timeout=None):
        state["calls"] += 1
        if state["calls"] <= 2:  # first sweep: both models exhausted
            raise _QuotaErr(10)
        return "ok"

    assert ai_client._call_with_fallback(make) == "ok"
    assert slept == [10.5]


def test_long_quota_wait_is_not_waited_out(monkeypatch):
    slept = []
    monkeypatch.setattr(ai_client.time, "sleep", lambda s: slept.append(s))
    monkeypatch.setattr(config, "OPENAI_MODEL", "a")
    monkeypatch.setattr(config, "OPENAI_FALLBACK_MODELS", [])

    def make(model, timeout=None):
        raise _QuotaErr(300)

    with pytest.raises(_QuotaErr):
        ai_client._call_with_fallback(make)
    assert slept == []



def test_overall_deadline_stops_a_slow_failing_chain(monkeypatch):
    """Even if every model keeps failing slowly, we give up at the deadline instead of hanging."""
    clock = {"t": 0.0}
    monkeypatch.setattr(ai_client.time, "monotonic", lambda: clock["t"])
    monkeypatch.setattr(ai_client.time, "sleep", lambda s: clock.__setitem__("t", clock["t"] + s))
    monkeypatch.setattr(config, "DEADLINE_S", 30)
    monkeypatch.setattr(config, "OPENAI_MODEL", "a")
    monkeypatch.setattr(config, "OPENAI_FALLBACK_MODELS", ["b", "c", "d"])
    calls = []

    def make(model, timeout=None):
        calls.append(model)
        clock["t"] += 12  # each attempt burns 12 seconds, then fails with a 503
        raise _Err(503)

    with pytest.raises(_Err):
        ai_client._call_with_fallback(make)
    assert clock["t"] <= 30 + 12  # stopped near the deadline, not after 4 models x 3 tries x 12s
    assert len(calls) < 12


def test_each_call_gets_a_timeout_no_longer_than_whats_left(monkeypatch):
    clock = {"t": 0.0}
    monkeypatch.setattr(ai_client.time, "monotonic", lambda: clock["t"])
    monkeypatch.setattr(config, "DEADLINE_S", 30)
    monkeypatch.setattr(config, "REQUEST_TIMEOUT_S", 20)
    seen = []

    def make(model, timeout=None):
        seen.append(timeout)
        return "ok"

    ai_client._call_with_fallback(make)
    assert seen == [20.0]



# ---------- OpenAI specifics ---------------------------------------------------------------

class _ApiError(Exception):
    """Looks like the OpenAI SDK's errors: an int status_code and a string code."""

    def __init__(self, status, code=None, message="boom"):
        super().__init__(message)
        self.status_code = status
        self.code = code


def test_out_of_credit_stops_at_once_with_a_clear_message(monkeypatch):
    slept, calls = [], []
    monkeypatch.setattr(ai_client.time, "sleep", lambda s: slept.append(s))

    def make(model, timeout=None):
        calls.append(model)
        raise _ApiError(429, "insufficient_quota", "You exceeded your current quota, please check your plan and billing")

    with pytest.raises(ai_client.AiUnavailable) as e:
        ai_client._call_with_fallback(make)
    assert "out of credit" in str(e.value)
    assert len(calls) == 1 and slept == []  # no retries, no other models: more of the same would fail too


def test_a_rate_limit_is_not_mistaken_for_no_credit(monkeypatch):
    monkeypatch.setattr(ai_client.time, "sleep", lambda s: None)
    monkeypatch.setattr(config, "OPENAI_MODEL", "main")
    monkeypatch.setattr(config, "OPENAI_FALLBACK_MODELS", ["backup"])
    seen = []

    def make(model, timeout=None):
        seen.append(model)
        if model == "main":
            raise _ApiError(429, "rate_limit_exceeded", "Rate limit reached. Please try again in 800ms.")
        return "ok"

    assert ai_client._call_with_fallback(make) == "ok"
    assert seen == ["main", "backup"]


def test_retry_delay_is_read_in_seconds_or_milliseconds():
    assert ai_client._retry_after_seconds(_ApiError(429, None, "Please try again in 1.5s.")) == 1.5
    assert ai_client._retry_after_seconds(_ApiError(429, None, "Please try again in 850ms.")) == 0.85
    assert ai_client._retry_after_seconds(_ApiError(429, None, "nothing useful here")) is None


def test_only_reasoning_models_get_a_reasoning_effort():
    assert ai_client._supports_reasoning_effort("gpt-6-luna")
    assert ai_client._supports_reasoning_effort("gpt-5.4-mini")
    assert not ai_client._supports_reasoning_effort("gpt-4.1-mini")


def test_sdk_style_errors_are_recognised_as_temporary():
    assert ai_client._is_transient(_ApiError(503, "server_error"))
    assert ai_client._is_transient(_ApiError(429, "rate_limit_exceeded"))
    assert not ai_client._is_transient(_ApiError(400, "invalid_request_error"))
    assert not ai_client._is_transient(_ApiError(429, "insufficient_quota"))



# ---------- production safety --------------------------------------------------------------

def test_production_refuses_to_start_without_an_internal_key():
    import subprocess
    import sys

    code = "import app.main"
    env = {"AI_SERVICE_ENV": "production", "MODEL_SERVICE_INTERNAL_KEY": "", "PATH": "", "SYSTEMROOT": "C:\\Windows"}
    r = subprocess.run([sys.executable, "-c", code], capture_output=True, text=True, env=env, cwd=str(config.SERVICE_DIR))
    assert r.returncode != 0
    assert "MODEL_SERVICE_INTERNAL_KEY" in r.stderr


def test_production_starts_with_a_key_and_hides_the_docs_page():
    import subprocess
    import sys

    code = "import app.main as m; print(m.app.docs_url, m.app.openapi_url)"
    env = {"AI_SERVICE_ENV": "production", "MODEL_SERVICE_INTERNAL_KEY": "x" * 20, "PATH": "", "SYSTEMROOT": "C:\\Windows"}
    r = subprocess.run([sys.executable, "-c", code], capture_output=True, text=True, env=env, cwd=str(config.SERVICE_DIR))
    assert r.returncode == 0, r.stderr
    assert r.stdout.strip().endswith("None None")
