import secrets
from urllib.parse import parse_qs, urlparse

import pytest

from momentum_server import create_app
from momentum_server.auth import pkce_challenge

APP_REDIRECT = "com.momentum.workout://auth/callback"


@pytest.fixture
def app(tmp_path):
    application = create_app(
        {
            "TESTING": True,
            "SECRET_KEY": "test-secret",
            "MOMENTUM_DATA_DIR": str(tmp_path),
            "MOMENTUM_DB_PATH": str(tmp_path / "momentum.db"),
            "LOGIN_URL": "",
            "LOGIN_CLIENT_SECRET": "",
            "LOGIN_REDIRECT_URI": "",
            "MOMENTUM_ADMIN_EMAILS": ("admin@example.com",),
            "MOMENTUM_APP_REDIRECTS": (APP_REDIRECT,),
            "MOMENTUM_CORS_ORIGINS": ("capacitor://localhost",),
            "PRODUCTION": False,
        }
    )
    yield application


@pytest.fixture
def client(app):
    return app.test_client()


def new_verifier() -> str:
    return secrets.token_urlsafe(48)


def start_handoff(client, verifier: str, state: str = "s1") -> str:
    """Runs the app sign-in flow with dev login and returns the handoff code."""
    response = client.get(
        "/auth/app/start",
        query_string={
            "redirect_uri": APP_REDIRECT,
            "state": state,
            "code_challenge": pkce_challenge(verifier),
            "code_challenge_method": "S256",
        },
    )
    assert response.status_code == 302, response.data
    response = client.get(response.headers["Location"])
    assert response.status_code == 302
    location = response.headers["Location"]
    assert location.startswith(APP_REDIRECT + "?")
    query = parse_qs(urlparse(location).query)
    assert query["state"] == [state]
    return query["code"][0]


def sign_in_token(client) -> str:
    verifier = new_verifier()
    code = start_handoff(client, verifier)
    response = client.post(
        "/api/app/token",
        json={"code": code, "code_verifier": verifier, "redirect_uri": APP_REDIRECT},
    )
    assert response.status_code == 200, response.data
    return response.get_json()["token"]


@pytest.fixture
def token(client):
    return sign_in_token(client)


@pytest.fixture
def auth(token):
    return {"Authorization": f"Bearer {token}"}
