from __future__ import annotations

from flask import Flask, abort, g, redirect, render_template, request, session, url_for

from momentum_server import insights, store


def register_admin(app: Flask) -> None:
    @app.before_request
    def load_web_user():
        g.user = None
        user_id = session.get("user_id")
        if user_id:
            g.user = store.get_user(user_id)
            if g.user is None:
                session.clear()

    @app.context_processor
    def shell():
        user = getattr(g, "user", None)
        return {
            "current_user": user,
            "is_admin": bool(user and store.is_admin_email(user["email"])),
        }

    @app.template_filter("when")
    def when(value):
        moment = insights.parse_time(value) if isinstance(value, str) else value
        return moment.strftime("%b %-d, %Y · %H:%M UTC") if moment else "—"

    @app.template_filter("day")
    def day(value):
        moment = insights.parse_time(value) if isinstance(value, str) else value
        return moment.strftime("%a %b %-d, %Y") if moment else "—"

    @app.template_filter("seconds")
    def seconds(value):
        value = int(value or 0)
        return f"{value // 60}m {value % 60:02d}s" if value >= 60 else f"{value}s"

    def require_login():
        if g.user is None:
            return redirect(url_for("login", next=request.path))
        return None

    def require_access(user_id: int):
        """Admins see everyone; signed-in users see only themselves."""
        if g.user["id"] != user_id and not store.is_admin_email(g.user["email"]):
            abort(403)
        user = store.get_user(user_id)
        if user is None:
            abort(404)
        return user

    @app.get("/")
    def home():
        if g.user is None:
            return render_template("home.html")
        if store.is_admin_email(g.user["email"]):
            return redirect(url_for("admin_users"))
        return redirect(url_for("me"))

    @app.get("/me")
    def me():
        if (response := require_login()) is not None:
            return response
        return _user_page(g.user)

    @app.get("/admin")
    def admin_users():
        if (response := require_login()) is not None:
            return response
        if not store.is_admin_email(g.user["email"]):
            abort(403)
        rows = []
        for user in store.list_users():
            tables = store.load_tables(user["id"])
            rows.append({"user": user, "summary": insights.summary(tables)})
        return render_template("admin_users.html", rows=rows)

    @app.get("/admin/users/<int:user_id>")
    def admin_user(user_id: int):
        if (response := require_login()) is not None:
            return response
        return _user_page(require_access(user_id))

    @app.get("/admin/users/<int:user_id>/sessions/<session_id>")
    def admin_session(user_id: int, session_id: str):
        if (response := require_login()) is not None:
            return response
        user = require_access(user_id)
        detail = insights.session_detail(store.load_tables(user["id"]), session_id)
        if detail is None:
            abort(404)
        return render_template("session.html", user=user, detail=detail)

    @app.post("/admin/users/<int:user_id>/devices/<int:device_id>/revoke")
    def revoke_device(user_id: int, device_id: int):
        if (response := require_login()) is not None:
            return response
        user = require_access(user_id)
        if any(device["id"] == device_id for device in store.list_devices(user["id"])):
            store.revoke_token(device_id)
        return redirect(request.referrer or url_for("admin_user", user_id=user_id))

    @app.errorhandler(403)
    def forbidden(_exc):
        return render_template("auth_error.html", message="You don't have access to that page."), 403

    @app.errorhandler(404)
    def not_found(_exc):
        if request.path.startswith("/api/"):
            return {"error": "Not found."}, 404
        return render_template("auth_error.html", message="Not found."), 404


def _user_page(user):
    tables = store.load_tables(user["id"])
    sessions = insights.workouts(tables)
    return render_template(
        "user.html",
        user=user,
        summary=insights.summary(tables),
        volume=insights.weekly_volume(tables),
        programs=insights.programs(tables),
        records=insights.records(tables),
        sessions=sessions[:60],
        more_sessions=max(0, len(sessions) - 60),
        devices=store.list_devices(user["id"]),
    )
