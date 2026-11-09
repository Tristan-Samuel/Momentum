from conftest import sign_in_token


def program(pid="p1", name="Day A"):
    return {"table": "workoutPrograms", "id": pid, "data": {"id": pid, "name": name, "order": 0}}


def test_api_requires_a_bearer_token(client):
    assert client.get("/api/me").status_code == 401
    assert client.get("/api/me", headers={"Authorization": "Bearer nope"}).status_code == 401
    assert client.post("/api/sync/push", json={"records": []}).status_code == 401


def test_me_reports_the_account(client, auth):
    body = client.get("/api/me", headers=auth).get_json()
    assert body["email"] == "dev@localhost"
    assert body["isAdmin"] is False
    assert body["hasData"] is False


def test_push_then_snapshot_round_trips(client, auth):
    response = client.post(
        "/api/sync/push",
        headers=auth,
        json={
            "records": [
                program(),
                {
                    "table": "appSettings",
                    "id": "app",
                    "data": {"id": "app", "weeklyGoal": 4, "nested": {"a": [1, 2]}},
                },
            ]
        },
    )
    assert response.status_code == 200
    assert response.get_json()["accepted"] == 2
    snap = client.get("/api/sync/snapshot", headers=auth).get_json()
    assert snap["format"] == "momentum-backup"
    assert snap["version"] == 1
    assert snap["tables"]["workoutPrograms"] == [{"id": "p1", "name": "Day A", "order": 0}]
    assert snap["tables"]["appSettings"][0]["nested"] == {"a": [1, 2]}
    assert snap["tables"]["setSessions"] == []
    assert client.get("/api/me", headers=auth).get_json()["hasData"] is True


def test_push_overwrites_and_deletes(client, auth):
    client.post("/api/sync/push", headers=auth, json={"records": [program(), program("p2", "Day B")]})
    client.post(
        "/api/sync/push",
        headers=auth,
        json={"records": [program("p1", "Renamed"), {"table": "workoutPrograms", "id": "p2", "deleted": True}]},
    )
    rows = client.get("/api/sync/snapshot", headers=auth).get_json()["tables"]["workoutPrograms"]
    assert rows == [{"id": "p1", "name": "Renamed", "order": 0}]


def test_reset_replaces_everything(client, auth):
    client.post("/api/sync/push", headers=auth, json={"records": [program(), program("p2")]})
    client.post("/api/sync/push", headers=auth, json={"reset": True, "records": [program("p3")]})
    rows = client.get("/api/sync/snapshot", headers=auth).get_json()["tables"]["workoutPrograms"]
    assert [row["id"] for row in rows] == ["p3"]


def test_users_cannot_see_each_others_records(app, client, auth):
    client.post("/api/sync/push", headers=auth, json={"records": [program()]})
    with app.app_context():
        from momentum_server import store

        other = store.upsert_user(sub="other", email="other@example.com", name="")
        other_token = store.issue_device_token(other["id"], "test")
    snap = client.get("/api/sync/snapshot", headers={"Authorization": f"Bearer {other_token}"}).get_json()
    assert snap["tables"]["workoutPrograms"] == []


def test_push_validates_tables_and_shapes(client, auth):
    bad_table = client.post(
        "/api/sync/push", headers=auth, json={"records": [{"table": "users", "id": "x", "data": {"id": "x"}}]}
    )
    assert bad_table.status_code == 400
    mismatched = client.post(
        "/api/sync/push",
        headers=auth,
        json={"records": [{"table": "exercises", "id": "x", "data": {"id": "y"}}]},
    )
    assert mismatched.status_code == 400
    assert client.post("/api/sync/push", headers=auth, json={"nope": 1}).status_code == 400


def test_push_is_capped_at_500_records(client, auth):
    records = [program(f"p{i}") for i in range(501)]
    assert client.post("/api/sync/push", headers=auth, json={"records": records}).status_code == 400


def test_uploads_over_the_size_cap_are_refused(app, client, auth):
    app.config["MAX_CONTENT_LENGTH"] = 1024
    response = client.post(
        "/api/sync/push",
        headers=auth,
        json={"records": [{"table": "exercises", "id": "x", "data": {"id": "x", "pad": "a" * 4096}}]},
    )
    assert response.status_code == 413


def test_logout_revokes_the_token(client, auth):
    assert client.post("/api/logout", headers=auth).status_code == 200
    assert client.get("/api/me", headers=auth).status_code == 401


def test_each_sign_in_gets_its_own_token(client):
    first = sign_in_token(client)
    second = sign_in_token(client)
    assert first != second
    client.post("/api/logout", headers={"Authorization": f"Bearer {first}"})
    assert client.get("/api/me", headers={"Authorization": f"Bearer {second}"}).status_code == 200


def test_cors_allows_the_app_origin_only(client, auth):
    ok = client.get("/api/me", headers={**auth, "Origin": "capacitor://localhost"})
    assert ok.headers["Access-Control-Allow-Origin"] == "capacitor://localhost"
    other = client.get("/api/me", headers={**auth, "Origin": "https://evil.example"})
    assert "Access-Control-Allow-Origin" not in other.headers


def test_cors_preflight(client):
    response = client.options(
        "/api/sync/push",
        headers={
            "Origin": "capacitor://localhost",
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "authorization, content-type",
        },
    )
    assert response.status_code == 200
    assert response.headers["Access-Control-Allow-Origin"] == "capacitor://localhost"
    assert "Authorization" in response.headers["Access-Control-Allow-Headers"]
