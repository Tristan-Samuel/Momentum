from __future__ import annotations

import base64
import hashlib
import re
import secrets
from urllib.parse import urlencode

from flask import (
    Flask,
    abort,
    current_app,
    jsonify,
    redirect,
    render_template,
    request,
    session,
    url_for,
)

from momentum_server import store
from momentum_server.sso import SSOError, identity_from_callback, sso_enabled, start_authorize

CHALLENGE_RE = re.compile(r"^[A-Za-z0-9_-]{43,128}$")
VERIFIER_RE = re.compile(r"^[A-Za-z0-9._~-]{43,128}$")
DEV_SUB = "local-dev"
DEV_EMAIL = "dev@localhost"


def pkce_challenge(verifier: str) -> str:
    digest = hashlib.sha256(verifier.encode("ascii")).digest()
    return base64.urlsafe_b64encode(digest).rstrip(b"=").decode("ascii")


def dev_login_allowed() -> bool:
    return not sso_enabled() and not current_app.config.get("PRODUCTION")


def safe_next(value: str | None) -> str:
    if not isinstance(value, str) or not value.startswith("/") or value.startswith("//"):
        return "/"
    return value


def sign_in(user) -> None:
    session["user_id"] = user["id"]
    session["email"] = user["email"]
    session.permanent = True


def register_auth(app: Flask) -> None:
    @app.get("/login")
    def login():
        nxt = safe_next(request.args.get("next"))
        if session.get("user_id"):
            return redirect(nxt)
        if sso_enabled():
            return start_authorize(next_url=nxt)
        if dev_login_allowed():
            sign_in(store.upsert_user(sub=DEV_SUB, email=DEV_EMAIL, name="Local developer"))
            return redirect(nxt)
        return render_template("auth_error.html", message="Sign-in is not configured."), 503

    @app.get("/auth/sso/callback")
    def sso_callback():
        try:
            identity = identity_from_callback()
        except SSOError as exc:
            return render_template("auth_error.html", message=exc.message), 400
        user = store.upsert_user(sub=identity.sub, email=identity.email, name=identity.name)
        sign_in(user)
        return redirect(safe_next(session.pop("sso_next", None)))

    @app.post("/logout")
    def logout():
        session.clear()
        return redirect(url_for("home"))

    @app.get("/auth/app/start")
    def app_start():
        redirect_uri = (request.args.get("redirect_uri") or "").strip()
        state = (request.args.get("state") or "").strip()
        challenge = (request.args.get("code_challenge") or "").strip()
        method = (request.args.get("code_challenge_method") or "S256").strip()
        if redirect_uri not in current_app.config["MOMENTUM_APP_REDIRECTS"]:
            return render_template("auth_error.html", message="This app is not allowed to sign in here."), 400
        if method != "S256" or not CHALLENGE_RE.match(challenge) or not state or len(state) > 200:
            return render_template("auth_error.html", message="The sign-in request was malformed."), 400
        session["app_flow"] = {"redirect_uri": redirect_uri, "state": state, "challenge": challenge}
        if sso_enabled():
            return start_authorize(next_url=url_for("app_finish"))
        if dev_login_allowed():
            sign_in(store.upsert_user(sub=DEV_SUB, email=DEV_EMAIL, name="Local developer"))
            return redirect(url_for("app_finish"))
        return render_template("auth_error.html", message="Sign-in is not configured."), 503

    @app.get("/auth/app/finish")
    def app_finish():
        flow = session.pop("app_flow", None)
        user_id = session.get("user_id")
        if not isinstance(flow, dict) or not user_id:
            return render_template("auth_error.html", message="Sign-in expired. Start again from the app."), 400
        if flow.get("redirect_uri") not in current_app.config["MOMENTUM_APP_REDIRECTS"]:
            abort(400)
        code = store.create_handoff(
            user_id=user_id, challenge=flow["challenge"], redirect_uri=flow["redirect_uri"]
        )
        joiner = "&" if "?" in flow["redirect_uri"] else "?"
        return redirect(f"{flow['redirect_uri']}{joiner}{urlencode({'code': code, 'state': flow['state']})}")

    @app.post("/api/app/token")
    def app_token():
        body = request.get_json(silent=True) or {}
        code = str(body.get("code") or "")
        verifier = str(body.get("code_verifier") or "")
        redirect_uri = str(body.get("redirect_uri") or "")
        device = str(body.get("device") or request.headers.get("User-Agent") or "Momentum app")
        if not code or not VERIFIER_RE.match(verifier):
            return jsonify({"error": "invalid_request"}), 400
        row = store.consume_handoff(code)
        if row is None:
            return jsonify({"error": "invalid_grant"}), 400
        if row["redirect_uri"] != redirect_uri or not secrets.compare_digest(
            row["challenge"], pkce_challenge(verifier)
        ):
            return jsonify({"error": "invalid_grant"}), 400
        user = store.get_user(row["user_id"])
        if user is None:
            return jsonify({"error": "invalid_grant"}), 400
        token = store.issue_device_token(user["id"], device)
        return jsonify(
            {
                "token": token,
                "user": {
                    "email": user["email"],
                    "name": user["name"],
                    "isAdmin": store.is_admin_email(user["email"]),
                },
            }
        )
