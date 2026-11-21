import json

from momentum_server.coach import interpret


def test_coach_requires_sign_in(client):
    assert client.post("/api/coach", json={"task": "analyze", "note": "", "context": {}}).status_code == 401


def test_coach_is_unavailable_without_a_key(client, auth):
    response = client.post(
        "/api/coach",
        headers=auth,
        json={"task": "analyze", "note": "", "context": {"program": {"id": "p1"}}},
    )
    assert response.status_code == 503


def test_coach_returns_a_clamped_program(client, auth, app):
    app.config["GEMINI_API_KEY"] = "test-key"

    def transport(_prompt: str) -> str:
        return json.dumps(
            {
                "summary": "A pull day.",
                "program": {
                    "name": "Pull",
                    "exercises": [
                        {
                            "name": "Pull-Up",
                            "sets": 99,
                            "minReps": 12,
                            "maxReps": 6,
                            "transitionAfterExerciseSeconds": 40,
                            "restAfterSetSeconds": 90,
                        }
                    ],
                },
                "edit": {"exerciseConfigId": "nope", "sets": 3},
                "recommendations": [{"note": "Ignore me."}],
            }
        )

    app.config["GEMINI_TRANSPORT"] = transport
    response = client.post(
        "/api/coach",
        headers=auth,
        json={"task": "create_program", "note": "pull day", "context": {"program": {"id": "p1"}}},
    )
    assert response.status_code == 200, response.data
    body = response.get_json()
    assert body["summary"] == "A pull day."
    assert body["edit"] is None
    assert body["recommendations"] == []
    exercise = body["program"]["exercises"][0]
    assert exercise["sets"] == 10
    assert exercise["minReps"] == 6
    assert exercise["maxReps"] == 12
    assert exercise["startPosition"] == "bottom"
    assert exercise["transitionAfterExerciseSeconds"] == 40


def test_edit_must_use_a_known_exercise(client, auth, app):
    app.config["GEMINI_API_KEY"] = "test-key"
    app.config["GEMINI_TRANSPORT"] = lambda _prompt: json.dumps(
        {
            "summary": "Updated.",
            "edit": {
                "exerciseConfigId": "cfg-pull",
                "startPosition": "bottom",
                "transitionAfterExerciseSeconds": 50,
            },
        }
    )
    response = client.post(
        "/api/coach",
        headers=auth,
        json={
            "task": "edit_exercise",
            "note": "start with the lift",
            "context": {"program": {"exercises": [{"exerciseConfigId": "cfg-pull"}]}},
        },
    )
    assert response.status_code == 200, response.data
    assert response.get_json()["edit"]["startPosition"] == "bottom"
    assert response.get_json()["edit"]["transitionAfterExerciseSeconds"] == 50
    assert response.get_json()["program"] is None


def test_coach_uses_the_tssamuel_key(client, auth, app, monkeypatch):
    app.config["GEMINI_API_KEY"] = ""
    app.config["LOGIN_CLIENT_ID"] = "momentum"
    app.config["LOGIN_CLIENT_SECRET"] = "secret"
    app.config["LOGIN_TOKEN_URL"] = "http://127.0.0.1:5111"
    app.config["GEMINI_MODEL"] = "gemini-2.5-flash"
    sent = {}

    class Response:
        status_code = 200

        def json(self):
            return {
                "text": json.dumps(
                    {
                        "summary": "Hold the pull-ups.",
                        "recommendations": [{"exerciseConfigId": "cfg", "note": "Stay here."}],
                    }
                )
            }

    def post(url, json=None, headers=None, timeout=None):
        sent["url"] = url
        sent["json"] = json
        sent["headers"] = headers
        sent["timeout"] = timeout
        return Response()

    monkeypatch.setattr("momentum_server.platform.requests.post", post)
    response = client.post(
        "/api/coach",
        headers=auth,
        json={"task": "analyze", "note": "plateau?", "context": {"program": {"id": "p1", "exercises": [{"exerciseConfigId": "cfg"}]}}},
    )
    assert response.status_code == 200, response.data
    assert response.get_json()["summary"] == "Hold the pull-ups."
    assert sent["url"] == "http://127.0.0.1:5111/platform/gemini"
    assert sent["json"]["model"] == "gemini-3.6-flash"
    assert sent["json"]["client_secret"] == "secret"
    assert sent["json"]["user_email"] == "dev@localhost"
    assert "x-goog-api-key" not in sent["headers"]
    assert "plateau?" in sent["json"]["contents"]


def test_coach_reports_a_platform_refusal(client, auth, app, monkeypatch):
    app.config["GEMINI_API_KEY"] = ""
    app.config["LOGIN_CLIENT_ID"] = "momentum"
    app.config["LOGIN_CLIENT_SECRET"] = "secret"
    app.config["LOGIN_TOKEN_URL"] = "http://127.0.0.1:5111"

    class Response:
        status_code = 429

        def json(self):
            return {"error": "cap"}

    monkeypatch.setattr("momentum_server.platform.requests.post", lambda *args, **kwargs: Response())
    response = client.post(
        "/api/coach",
        headers=auth,
        json={"task": "analyze", "note": "", "context": {"program": {"id": "p1"}}},
    )
    assert response.status_code == 429
    assert "daily" in response.get_json()["error"]


def test_coach_retries_when_gemini_is_busy(client, auth, app, monkeypatch):
    app.config["GEMINI_API_KEY"] = ""
    app.config["LOGIN_CLIENT_ID"] = "momentum"
    app.config["LOGIN_CLIENT_SECRET"] = "secret"
    app.config["LOGIN_TOKEN_URL"] = "http://127.0.0.1:5111"
    monkeypatch.setattr("momentum_server.platform.time.sleep", lambda _seconds: None)
    calls = {"n": 0}

    class Response:
        def __init__(self, status, body):
            self.status_code = status
            self._body = body

        def json(self):
            return self._body

    def post(*_args, **_kwargs):
        calls["n"] += 1
        if calls["n"] == 1:
            return Response(502, {"error": "gemini_unavailable"})
        return Response(200, {"text": json.dumps({"summary": "Add a morning set.", "recommendations": []})})

    monkeypatch.setattr("momentum_server.platform.requests.post", post)
    response = client.post(
        "/api/coach",
        headers=auth,
        json={"task": "analyze", "note": "morning too", "context": {"program": {"id": "p1"}}},
    )
    assert response.status_code == 200, response.data
    assert response.get_json()["summary"] == "Add a morning set."
    assert calls["n"] == 2


def test_coach_reports_gemini_when_it_stays_busy(client, auth, app, monkeypatch):
    app.config["GEMINI_API_KEY"] = ""
    app.config["LOGIN_CLIENT_ID"] = "momentum"
    app.config["LOGIN_CLIENT_SECRET"] = "secret"
    app.config["LOGIN_TOKEN_URL"] = "http://127.0.0.1:5111"
    monkeypatch.setattr("momentum_server.platform.time.sleep", lambda _seconds: None)

    class Response:
        status_code = 502

        def json(self):
            return {"error": "gemini_unavailable"}

    monkeypatch.setattr("momentum_server.platform.requests.post", lambda *_args, **_kwargs: Response())
    response = client.post(
        "/api/coach",
        headers=auth,
        json={"task": "analyze", "note": "", "context": {"program": {"id": "p1"}}},
    )
    assert response.status_code == 503
    assert "Gemini could not answer" in response.get_json()["error"]


def test_coach_sends_the_whole_log_to_gemini():
    seen = {}

    def transport(prompt: str) -> str:
        seen["prompt"] = prompt
        return json.dumps(
            {
                "summary": "Looked at both days.",
                "recommendations": [{"exerciseConfigId": "squat", "note": "Keep the squat where it is."}],
            }
        )

    reply = interpret(
        "analyze",
        "what should change this week?",
        {
            "brief": "# Schedule\nMorning rotation.\n# Adding an exercise\nsets: 1 to 10\n# How the app works\nRest is only between sets.",
            "focusProgramId": None,
            "programs": [
                {"id": "pull", "name": "Pull", "exercises": [{"exerciseConfigId": "pull-up"}]},
                {"id": "legs", "name": "Legs", "exercises": [{"exerciseConfigId": "squat"}]},
            ],
        },
        transport,
    )

    prompt = seen["prompt"]
    structured = prompt.split("Structured context:", 1)[1]
    assert "Morning rotation." in prompt
    assert "# Adding an exercise" in prompt
    assert "# How the app works" in prompt
    assert "Do not limit a question" in prompt
    assert "squat" in structured
    assert '"brief"' not in structured
    assert reply["recommendations"][0]["exerciseConfigId"] == "squat"
    assert reply["program"] is None


def test_unknown_edit_id_is_rejected():
    try:
        interpret(
            "edit_exercise",
            "change it",
            {"program": {"exercises": [{"exerciseConfigId": "real"}]}},
            lambda _prompt: json.dumps({"summary": "x", "edit": {"exerciseConfigId": "fake", "sets": 3}}),
        )
    except Exception as exc:
        assert "did not return a change" in str(exc)
    else:
        raise AssertionError("expected a coach error")
