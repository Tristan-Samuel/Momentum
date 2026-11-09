import pytest

from momentum_server import store


def seed_workout(user_id):
    tables = {
        "workoutPrograms": [{"id": "p1", "name": "Day A", "order": 0}],
        "exercises": [{"id": "e1", "name": "Push-up"}, {"id": "e2", "name": "Plank"}],
        "exerciseConfigurations": [
            {
                "id": "c1",
                "programId": "p1",
                "exerciseId": "e1",
                "order": 0,
                "sets": 2,
                "minReps": 6,
                "maxReps": 12,
                "measure": "reps",
                "tempo": {"eccentric": 3, "bottomPause": 0, "concentric": 1, "topPause": 0},
                "resistanceLabel": "Bodyweight",
                "laterality": "bilateral",
            },
            {
                "id": "c2",
                "programId": "p1",
                "exerciseId": "e2",
                "order": 1,
                "sets": 1,
                "minReps": 15,
                "maxReps": 60,
                "measure": "seconds",
                "tempo": {},
                "resistanceLabel": "Bodyweight",
                "laterality": "bilateral",
            },
        ],
        "progressionStates": [{"id": "e1", "exerciseId": "e1", "currentTargets": [9, 9]}],
        "workoutSessions": [
            {
                "id": "w1",
                "programNameSnapshot": "Day A",
                "status": "completed",
                "startedAt": "2026-11-02T10:00:00.000Z",
                "durationMs": 1_200_000,
                "totalSets": 3,
            },
            {"id": "w2", "programNameSnapshot": "Day A", "status": "discarded", "startedAt": "2026-11-03T10:00:00Z"},
        ],
        "exerciseSessions": [
            {"id": "x1", "workoutSessionId": "w1", "order": 0, "nameSnapshot": "Push-up", "configSnapshot": {}},
            {
                "id": "x2",
                "workoutSessionId": "w1",
                "order": 1,
                "nameSnapshot": "Plank",
                "configSnapshot": {"measure": "seconds"},
            },
        ],
        "setSessions": [
            {"id": "s1", "workoutSessionId": "w1", "exerciseSessionId": "x1", "setIndex": 0, "actualTarget": 9, "completedReps": 9},
            {"id": "s2", "workoutSessionId": "w1", "exerciseSessionId": "x1", "setIndex": 1, "actualTarget": 9, "completedReps": 8},
            {"id": "s3", "workoutSessionId": "w1", "exerciseSessionId": "x2", "setIndex": 0, "actualTarget": 30, "completedReps": 45},
        ],
        "personalRecords": [
            {"id": "r1", "exerciseId": "e1", "kind": "best_set_reps", "value": 9, "achievedAt": "2026-11-02T10:10:00Z"}
        ],
    }
    store.replace_all(user_id, tables)


@pytest.fixture
def people(app):
    with app.app_context():
        admin = store.upsert_user(sub="a", email="admin@example.com", name="Admin")
        alice = store.upsert_user(sub="b", email="alice@example.com", name="Alice")
        bob = store.upsert_user(sub="c", email="bob@example.com", name="Bob")
        seed_workout(alice["id"])
        return {"admin": admin["id"], "alice": alice["id"], "bob": bob["id"]}


def as_user(client, user_id, email):
    with client.session_transaction() as sess:
        sess["user_id"] = user_id
        sess["email"] = email
    return client


def test_signed_out_visitors_see_the_landing_page(client):
    response = client.get("/")
    assert response.status_code == 200
    assert b"Sign in" in response.data
    assert client.get("/admin").status_code == 302


def test_admin_lists_users_with_stats(client, people):
    as_user(client, people["admin"], "admin@example.com")
    assert client.get("/").headers["Location"].endswith("/admin")
    page = client.get("/admin")
    assert page.status_code == 200
    assert b"alice@example.com" in page.data
    assert b"bob@example.com" in page.data


def test_admin_sees_a_users_training(client, people):
    as_user(client, people["admin"], "admin@example.com")
    page = client.get(f"/admin/users/{people['alice']}")
    assert page.status_code == 200
    body = page.data.decode()
    assert "Push-up" in body and "Plank" in body
    assert "9 · 9" in body
    assert "45s" in body
    detail = client.get(f"/admin/users/{people['alice']}/sessions/w1")
    assert detail.status_code == 200
    assert "Day A" in detail.data.decode()
    assert client.get(f"/admin/users/{people['alice']}/sessions/w2").status_code == 200
    assert client.get(f"/admin/users/{people['alice']}/sessions/missing").status_code == 404


def test_non_admins_only_see_themselves(client, people):
    as_user(client, people["bob"], "bob@example.com")
    assert client.get("/").headers["Location"].endswith("/me")
    assert client.get("/me").status_code == 200
    assert client.get(f"/admin/users/{people['bob']}").status_code == 200
    assert client.get("/admin").status_code == 403
    assert client.get(f"/admin/users/{people['alice']}").status_code == 403
    assert client.get(f"/admin/users/{people['alice']}/sessions/w1").status_code == 403


def test_users_can_sign_out_their_devices(app, client, people):
    with app.app_context():
        token = store.issue_device_token(people["bob"], "iPhone")
        device_id = store.list_devices(people["bob"])[0]["id"]
    as_user(client, people["bob"], "bob@example.com")
    client.post(f"/admin/users/{people['bob']}/devices/{device_id}/revoke")
    assert client.get("/api/me", headers={"Authorization": f"Bearer {token}"}).status_code == 401


def test_summary_counts_reps_and_holds_separately(app, people):
    from momentum_server import insights

    with app.app_context():
        tables = store.load_tables(people["alice"])
    summary = insights.summary(tables)
    assert summary["workouts"] == 1
    assert summary["total_reps"] == 17
    assert summary["total_hold_seconds"] == 45
