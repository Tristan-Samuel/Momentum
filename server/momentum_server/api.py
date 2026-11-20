from __future__ import annotations

from functools import wraps

from flask import Flask, current_app, g, jsonify, request

from momentum_server import coach, platform, store

BACKUP_FORMAT = "momentum-backup"
BACKUP_VERSION = 1


def bearer_required(view):
    @wraps(view)
    def wrapped(*args, **kwargs):
        header = request.headers.get("Authorization", "")
        scheme, _, token = header.partition(" ")
        if scheme.lower() != "bearer" or not token.strip():
            return jsonify({"error": "Sign in required."}), 401
        user = store.user_for_token(token.strip())
        if user is None:
            return jsonify({"error": "Signed out. Sign in again."}), 401
        g.api_user = user
        return view(*args, **kwargs)

    return wrapped


def register_api(app: Flask) -> None:
    @app.after_request
    def cors(response):
        if not request.path.startswith("/api/"):
            return response
        origin = request.headers.get("Origin", "")
        if origin and origin in current_app.config["MOMENTUM_CORS_ORIGINS"]:
            response.headers["Access-Control-Allow-Origin"] = origin
            response.headers["Access-Control-Allow-Headers"] = "Authorization, Content-Type"
            response.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
            response.headers["Access-Control-Max-Age"] = "600"
        response.headers.add("Vary", "Origin")
        return response

    @app.errorhandler(413)
    def too_large(_exc):
        if request.path.startswith("/api/"):
            return jsonify({"error": "Upload is too large."}), 413
        return "Upload is too large.", 413

    @app.get("/api/me")
    @bearer_required
    def api_me():
        user = g.api_user
        counts = store.record_counts(user["id"])
        return jsonify(
            {
                "email": user["email"],
                "name": user["name"],
                "isAdmin": store.is_admin_email(user["email"]),
                "lastSyncAt": user["last_sync_at"],
                "counts": counts,
                "hasData": sum(counts.values()) > 0,
            }
        )

    @app.post("/api/sync/push")
    @bearer_required
    def push():
        body = request.get_json(silent=True)
        if not isinstance(body, dict) or not isinstance(body.get("records"), list):
            return jsonify({"error": "Expected {records: [...]}."}), 400
        records = body["records"]
        limit = current_app.config["PUSH_MAX_RECORDS"]
        if len(records) > limit:
            return jsonify({"error": f"At most {limit} records per push."}), 400
        user_id = g.api_user["id"]
        try:
            if body.get("reset") is True:
                accepted = store.replace_all(user_id, _group(records))
            else:
                accepted = store.apply_records(user_id, records)
        except store.RecordError as exc:
            return jsonify({"error": str(exc)}), 400
        return jsonify({"accepted": accepted, "serverTime": store.iso()})

    @app.get("/api/sync/snapshot")
    @bearer_required
    def snapshot():
        return jsonify(
            {
                "format": BACKUP_FORMAT,
                "version": BACKUP_VERSION,
                "exportedAt": store.iso(),
                "tables": store.load_tables(g.api_user["id"]),
            }
        )

    @app.post("/api/logout")
    @bearer_required
    def api_logout():
        store.revoke_token(g.api_user["token_id"])
        return jsonify({"ok": True})

    @app.post("/api/coach")
    @bearer_required
    def api_coach():
        body = request.get_json(silent=True)
        if not isinstance(body, dict):
            return jsonify({"error": "Expected a JSON object."}), 400
        api_key = current_app.config.get("GEMINI_API_KEY", "")
        transport = current_app.config.get("GEMINI_TRANSPORT")
        if not api_key and transport is None and not platform.platform_configured():
            return jsonify({"error": "Gemini is not configured on tssamuel.com yet."}), 503

        def complete(prompt: str) -> str:
            if transport is not None:
                return transport(prompt)
            if platform.platform_configured():
                try:
                    return platform.complete(prompt, user_email=str(g.api_user["email"] or ""))
                except platform.PlatformError as exc:
                    raise coach.CoachError(str(exc), exc.status) from exc
            return coach.complete_with_gemini(
                prompt,
                api_key=api_key,
                model=current_app.config.get("GEMINI_MODEL") or platform.DEFAULT_MODEL,
            )

        try:
            reply = coach.interpret(
                str(body.get("task") or ""),
                body.get("note") if isinstance(body.get("note"), str) else "",
                body.get("context"),
                complete,
            )
        except coach.CoachError as exc:
            return jsonify({"error": str(exc)}), exc.status
        return jsonify(reply)


def _group(records: list) -> dict[str, list]:
    """Turns push records into tables for a full replace; deletes are simply left out."""
    tables: dict[str, list] = {}
    for record in records:
        if not isinstance(record, dict):
            raise store.RecordError("Each record must be an object.")
        table = record.get("table")
        if table not in store.SYNC_TABLES:
            raise store.RecordError(f"Unknown table: {str(table)[:40]}")
        if record.get("deleted"):
            continue
        tables.setdefault(table, []).append(record.get("data"))
    return tables
