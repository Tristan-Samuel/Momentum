import pytest

from momentum_server import create_app
from momentum_server.sso import SSOError, identity_from_callback


@pytest.fixture
def sso_app(tmp_path):
    return create_app(
        {
            "TESTING": True,
            "SECRET_KEY": "test-secret",
            "MOMENTUM_DATA_DIR": str(tmp_path),
            "MOMENTUM_DB_PATH": str(tmp_path / "momentum.db"),
            "LOGIN_URL": "https://login.example",
            "LOGIN_TOKEN_URL": "http://127.0.0.1:5111",
            "LOGIN_CLIENT_ID": "momentum",
            "LOGIN_CLIENT_SECRET": "secret",
            "LOGIN_REDIRECT_URI": "https://momentum.tssamuel.com/auth/sso/callback",
            "MOMENTUM_ADMIN_EMAILS": ("admin@example.com",),
        }
    )


class FakeResponse:
    def __init__(self, status_code, payload):
        self.status_code = status_code
        self._payload = payload

    def json(self):
        return self._payload


def test_login_redirects_to_tssamuel(sso_app):
    response = sso_app.test_client().get("/login")
    assert response.status_code == 302
    location = response.headers["Location"]
    assert location.startswith("https://login.example/authorize?")
    assert "client_id=momentum" in location


def test_protected_pages_send_you_to_login(sso_app):
    response = sso_app.test_client().get("/admin")
    assert response.status_code == 302
    assert response.headers["Location"].startswith("/login")


def test_health_stays_open(sso_app):
    response = sso_app.test_client().get("/health")
    assert response.status_code == 200
    assert response.get_json()["ok"] is True


def test_callback_rejects_a_mismatched_state(sso_app):
    client = sso_app.test_client()
    with client.session_transaction() as sess:
        sess["sso_state"] = "expected-state"
    response = client.get("/auth/sso/callback?state=other-state&code=abc")
    assert response.status_code == 400
    assert b"could not be verified" in response.data


def test_callback_rejects_a_missing_code(sso_app):
    client = sso_app.test_client()
    with client.session_transaction() as sess:
        sess["sso_state"] = "expected-state"
    response = client.get("/auth/sso/callback?state=expected-state")
    assert response.status_code == 400
    assert b"cancelled" in response.data


def test_identity_from_callback_does_not_accept_a_forged_state(sso_app):
    with sso_app.test_request_context("/auth/sso/callback?state=nope&code=abc"):
        from flask import session

        session["sso_state"] = "expected-state"
        with pytest.raises(SSOError, match="could not be verified"):
            identity_from_callback()


def test_callback_signs_in_and_upserts_by_sub_then_email(sso_app, monkeypatch):
    calls = []

    def fake_post(url, json, timeout):
        calls.append((url, json))
        return FakeResponse(
            200,
            {"sub": json["code"], "email": "Admin@Example.com", "name": "Ada", "email_verified": True},
        )

    monkeypatch.setattr("momentum_server.sso.requests.post", fake_post)
    client = sso_app.test_client()
    with client.session_transaction() as sess:
        sess["sso_state"] = "st"
        sess["sso_next"] = "/admin"
    response = client.get("/auth/sso/callback?state=st&code=sub-1")
    assert response.status_code == 302
    assert response.headers["Location"] == "/admin"
    assert calls[0][0] == "http://127.0.0.1:5111/token"
    assert calls[0][1]["client_secret"] == "secret"
    assert client.get("/admin").status_code == 200

    # A new sub with the same email reuses the account instead of creating a second one.
    other = sso_app.test_client()
    with other.session_transaction() as sess:
        sess["sso_state"] = "st2"
    other.get("/auth/sso/callback?state=st2&code=sub-2")
    with sso_app.app_context():
        from momentum_server import store

        users = store.list_users()
        assert len(users) == 1
        assert users[0]["sub"] == "sub-2"
        assert users[0]["email"] == "admin@example.com"


def test_callback_rejects_open_redirects(sso_app, monkeypatch):
    monkeypatch.setattr(
        "momentum_server.sso.requests.post",
        lambda url, json, timeout: FakeResponse(200, {"sub": "x", "email": "x@example.com"}),
    )
    client = sso_app.test_client()
    with client.session_transaction() as sess:
        sess["sso_state"] = "st"
        sess["sso_next"] = "//evil.example"
    response = client.get("/auth/sso/callback?state=st&code=c")
    assert response.headers["Location"] == "/"


def test_app_start_goes_through_tssamuel_login(sso_app):
    from momentum_server.auth import pkce_challenge

    client = sso_app.test_client()
    response = client.get(
        "/auth/app/start",
        query_string={
            "redirect_uri": "com.momentum.workout://auth/callback",
            "state": "abc",
            "code_challenge": pkce_challenge("v" * 50),
        },
    )
    assert response.status_code == 302
    assert response.headers["Location"].startswith("https://login.example/authorize?")
    with client.session_transaction() as sess:
        assert sess["sso_next"] == "/auth/app/finish"
        assert sess["app_flow"]["state"] == "abc"


def test_production_without_sso_refuses_dev_login(tmp_path):
    app = create_app(
        {
            "TESTING": True,
            "MOMENTUM_DATA_DIR": str(tmp_path),
            "MOMENTUM_DB_PATH": str(tmp_path / "m.db"),
            "LOGIN_URL": "",
            "PRODUCTION": True,
        }
    )
    assert app.test_client().get("/login").status_code == 503
