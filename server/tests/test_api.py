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


def test_stale_push_is_ignored(client, auth):
    newer = {
        "table": "workoutPrograms",
        "id": "p1",
        "data": {"id": "p1", "name": "New", "order": 0, "updatedAt": "2026-02-02T00:00:00.000Z"},
    }
    older = {
        "table": "workoutPrograms",
        "id": "p1",
        "data": {"id": "p1", "name": "Old", "order": 0, "updatedAt": "2026-01-01T00:00:00.000Z"},
    }
    assert client.post("/api/sync/push", headers=auth, json={"records": [newer]}).get_json()["accepted"] == 1
    stale = client.post("/api/sync/push", headers=auth, json={"records": [older]})
    assert stale.get_json()["accepted"] == 0
    same = client.post("/api/sync/push", headers=auth, json={"records": [newer]})
    assert same.get_json()["accepted"] == 0
    rows = client.get("/api/sync/snapshot", headers=auth).get_json()["tables"]["workoutPrograms"]
    assert rows == [{"id": "p1", "name": "New", "order": 0, "updatedAt": "2026-02-02T00:00:00.000Z"}]


def test_older_delete_does_not_remove_a_newer_row(client, auth):
    client.post(
        "/api/sync/push",
        headers=auth,
        json={
            "records": [
                {
                    "table": "workoutPrograms",
                    "id": "p1",
                    "data": {"id": "p1", "name": "New", "updatedAt": "2026-02-02T00:00:00.000Z"},
                }
            ]
        },
    )
    deleted = client.post(
        "/api/sync/push",
        headers=auth,
        json={"records": [{"table": "workoutPrograms", "id": "p1", "deleted": True, "updatedAt": "2026-01-01T00:00:00.000Z"}]},
    )
    assert deleted.get_json()["accepted"] == 0
    rows = client.get("/api/sync/snapshot", headers=auth).get_json()["tables"]["workoutPrograms"]
    assert rows[0]["name"] == "New"


def test_changes_include_tombstones_and_a_cursor(client, auth):
    client.post(
        "/api/sync/push",
        headers=auth,
        json={
            "records": [
                {
                    "table": "workoutPrograms",
                    "id": "p1",
                    "data": {"id": "p1", "name": "Day A", "updatedAt": "2026-01-01T00:00:00.000Z"},
                }
            ]
        },
    )
    client.post(
        "/api/sync/push",
        headers=auth,
        json={"records": [{"table": "workoutPrograms", "id": "p1", "deleted": True, "updatedAt": "2026-03-01T00:00:00.000Z"}]},
    )
    page = client.get("/api/sync/changes", headers=auth).get_json()
    assert page["epoch"] == 0
    assert page["cursor"].isdigit()
    assert {"table": "workoutPrograms", "id": "p1", "deleted": True} in page["records"]
    again = client.get("/api/sync/changes", headers=auth, query_string={"since": page["cursor"]}).get_json()
    assert again["records"] == []
    assert again["cursor"] == page["cursor"]
    assert client.get("/api/sync/changes", headers=auth, query_string={"since": "nope"}).status_code == 400


def test_reset_bumps_the_epoch(client, auth):
    client.post("/api/sync/push", headers=auth, json={"records": [program()]})
    first = client.get("/api/sync/changes", headers=auth).get_json()["epoch"]
    client.post("/api/sync/push", headers=auth, json={"reset": True, "records": [program("p3")]})
    page = client.get("/api/sync/changes", headers=auth).get_json()
    assert page["epoch"] == first + 1
    assert [row["id"] for row in page["records"] if not row.get("deleted")] == ["p3"]


def test_web_token_requires_a_signed_in_session(client):
    assert client.post("/api/web/token").status_code == 401
    assert client.get("/login").status_code == 302
    first = client.post("/api/web/token").get_json()
    second = client.post("/api/web/token").get_json()
    assert first["token"] == second["token"]
    assert first["user"]["email"] == "dev@localhost"
    assert client.get("/api/me", headers={"Authorization": f"Bearer {first['token']}"}).status_code == 200


def test_web_dist_serves_the_app_and_leaves_the_api_alone(tmp_path):
    from momentum_server import create_app

    dist = tmp_path / "dist"
    (dist / "assets").mkdir(parents=True)
    (dist / "index.html").write_text("<!doctype html><div id=root>", encoding="utf-8")
    (dist / "favicon.svg").write_text("<svg></svg>", encoding="utf-8")
    (dist / "assets" / "app.js").write_text("console.log(1)", encoding="utf-8")
    application = create_app(
        {
            "TESTING": True,
            "SECRET_KEY": "test-secret",
            "MOMENTUM_DATA_DIR": str(tmp_path),
            "MOMENTUM_DB_PATH": str(tmp_path / "momentum.db"),
            "LOGIN_URL": "",
            "LOGIN_CLIENT_SECRET": "",
            "MOMENTUM_WEB_DIST": str(dist),
            "PRODUCTION": False,
        }
    )
    browser = application.test_client()
    assert b"id=root" in browser.get("/").data
    assert b"id=root" in browser.get("/configure").data
    assert b"id=root" in browser.get("/schedule").data
    assert b"id=root" in browser.get("/review/abc").data
    assert browser.get("/favicon.svg").data.startswith(b"<svg")
    assert browser.get("/assets/app.js").status_code == 200
    assert browser.get("/health").status_code == 200
    assert browser.get("/login").status_code == 302
    assert browser.get("/api/me").status_code == 401
    missing = browser.get("/api/nope")
    assert missing.status_code == 404
    assert b"id=root" not in missing.data


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
