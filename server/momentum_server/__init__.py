from __future__ import annotations

import os

from flask import Flask, jsonify
from werkzeug.middleware.proxy_fix import ProxyFix

from momentum_server.admin import register_admin
from momentum_server.api import register_api
from momentum_server.auth import register_auth
from momentum_server.config import DEV_SECRET, Config
from momentum_server.store import close_db, init_db


def create_app(test_config: dict | None = None) -> Flask:
    app = Flask(__name__, template_folder="templates", static_folder="static")
    app.config.from_object(Config)
    app.config["PRODUCTION"] = os.environ.get("ENV", "").lower() == "production"
    if test_config:
        app.config.update(test_config)

    testing = bool(app.config.get("TESTING"))
    if app.config["PRODUCTION"] and not testing and app.config.get("SECRET_KEY") in {"", DEV_SECRET, "dev"}:
        raise RuntimeError("MOMENTUM_SECRET_KEY must be set in production.")

    os.makedirs(app.config["MOMENTUM_DATA_DIR"], exist_ok=True)
    init_db(app.config["MOMENTUM_DB_PATH"])
    app.wsgi_app = ProxyFix(app.wsgi_app, x_for=1, x_proto=1, x_host=1)
    app.teardown_appcontext(close_db)

    register_admin(app)
    register_auth(app)
    register_api(app)

    @app.get("/health")
    def health():
        return jsonify({"ok": True})

    return app
