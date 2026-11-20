"""Serves the built React app when MOMENTUM_WEB_DIST points at a Vite dist folder."""

from __future__ import annotations

import os

from flask import Flask, abort, current_app, send_from_directory

# Flask already owns these. A missing path under them must not become the app shell.
_RESERVED = ("api", "auth", "admin", "login", "logout", "me", "health", "static")


def web_dist() -> str | None:
    raw = str(current_app.config.get("MOMENTUM_WEB_DIST") or "").strip()
    if not raw:
        return None
    path = os.path.abspath(raw)
    if os.path.isfile(os.path.join(path, "index.html")):
        return path
    return None


def send_app_index():
    dist = web_dist()
    if dist is None:
        return None
    return send_from_directory(dist, "index.html")


def register_web(app: Flask) -> None:
    @app.get("/<path:path>")
    def spa(path: str):
        dist = web_dist()
        if dist is None:
            abort(404)
        head = path.split("/", 1)[0]
        if head in _RESERVED:
            abort(404)
        target = os.path.abspath(os.path.join(dist, path))
        if target.startswith(dist + os.sep) and os.path.isfile(target):
            return send_from_directory(dist, path)
        return send_from_directory(dist, "index.html")
