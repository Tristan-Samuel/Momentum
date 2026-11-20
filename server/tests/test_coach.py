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
