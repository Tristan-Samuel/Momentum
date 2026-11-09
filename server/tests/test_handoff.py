from conftest import APP_REDIRECT, new_verifier, start_handoff

from momentum_server.auth import pkce_challenge


def exchange(client, code, verifier, redirect_uri=APP_REDIRECT):
    return client.post(
        "/api/app/token",
        json={"code": code, "code_verifier": verifier, "redirect_uri": redirect_uri},
    )


def test_pkce_challenge_matches_rfc_7636_example():
    verifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"
    assert pkce_challenge(verifier) == "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM"


def test_full_handoff_issues_a_device_token(client):
    verifier = new_verifier()
    code = start_handoff(client, verifier)
    response = exchange(client, code, verifier)
    assert response.status_code == 200
    body = response.get_json()
    assert len(body["token"]) > 30
    assert body["user"]["email"] == "dev@localhost"


def test_handoff_code_is_single_use(client):
    verifier = new_verifier()
    code = start_handoff(client, verifier)
    assert exchange(client, code, verifier).status_code == 200
    assert exchange(client, code, verifier).get_json()["error"] == "invalid_grant"


def test_wrong_verifier_is_rejected(client):
    code = start_handoff(client, new_verifier())
    response = exchange(client, code, new_verifier())
    assert response.status_code == 400
    assert response.get_json()["error"] == "invalid_grant"


def test_redirect_must_match(client):
    verifier = new_verifier()
    code = start_handoff(client, verifier)
    assert exchange(client, code, verifier, redirect_uri="com.evil://cb").status_code == 400


def test_expired_code_is_rejected(app, client):
    app.config["HANDOFF_TTL_SECONDS"] = -5
    verifier = new_verifier()
    code = start_handoff(client, verifier)
    assert exchange(client, code, verifier).status_code == 400


def test_start_rejects_unknown_redirects(client):
    response = client.get(
        "/auth/app/start",
        query_string={
            "redirect_uri": "https://evil.example/cb",
            "state": "s",
            "code_challenge": pkce_challenge(new_verifier()),
        },
    )
    assert response.status_code == 400


def test_start_requires_s256_and_a_real_challenge(client):
    base = {"redirect_uri": APP_REDIRECT, "state": "s"}
    assert client.get("/auth/app/start", query_string={**base, "code_challenge": "short"}).status_code == 400
    assert (
        client.get(
            "/auth/app/start",
            query_string={
                **base,
                "code_challenge": pkce_challenge(new_verifier()),
                "code_challenge_method": "plain",
            },
        ).status_code
        == 400
    )


def test_finish_without_a_flow_fails(client):
    client.get("/login")
    assert client.get("/auth/app/finish").status_code == 400
