"""Coach calls that use the Gemini key kept by login.tssamuel.com."""

from __future__ import annotations

import time

import requests
from flask import current_app

# Models login will forward. Anything else is replaced with the default.
PLATFORM_MODELS = ("gemini-3.6-flash", "gemini-3.5-flash-lite", "gemini-3.1-flash-lite")
DEFAULT_MODEL = "gemini-3.6-flash"

_MESSAGES = {
    "not_enabled": "Momentum is not allowed to use Gemini on tssamuel.com yet.",
    "not_configured": "Gemini is not configured on tssamuel.com yet.",
    "cap": "The daily Gemini limit is used up.",
    "rate_limited": "Too many coach requests. Try again in a minute.",
    "gemini_unavailable": "Gemini could not answer. Try again in a moment.",
    "bad_request": "The coach request was rejected.",
    "invalid_client": "Momentum could not sign in to tssamuel.com.",
}
_STATUS = {
    "not_enabled": 503,
    "not_configured": 503,
    "cap": 429,
    "rate_limited": 429,
    "gemini_unavailable": 503,
}


class PlatformError(Exception):
    def __init__(self, message: str, status: int = 503, code: str = "") -> None:
        super().__init__(message)
        self.status = status
        self.code = code


def platform_configured() -> bool:
    config = current_app.config
    return bool(
        str(config.get("LOGIN_TOKEN_URL") or "").strip()
        and str(config.get("LOGIN_CLIENT_ID") or "").strip()
        and str(config.get("LOGIN_CLIENT_SECRET") or "").strip()
    )


def model_name() -> str:
    raw = str(current_app.config.get("GEMINI_MODEL") or DEFAULT_MODEL).strip()
    return raw if raw in PLATFORM_MODELS else DEFAULT_MODEL


def complete(prompt: str, *, user_email: str) -> str:
    """Retries a fast Gemini 503. A slow failure is returned as-is so gunicorn is not killed."""
    delay = 0.5
    for attempt in range(3):
        started = time.monotonic()
        try:
            return _complete_once(prompt, user_email=user_email)
        except PlatformError as exc:
            if exc.code != "gemini_unavailable" or attempt == 2 or time.monotonic() - started > 8:
                raise
            time.sleep(delay)
            delay *= 2
    raise PlatformError("Gemini could not answer. Try again in a moment.", 503, "gemini_unavailable")


def _complete_once(prompt: str, *, user_email: str) -> str:
    config = current_app.config
    try:
        response = requests.post(
            f"{str(config.get('LOGIN_TOKEN_URL')).rstrip('/')}/platform/gemini",
            json={
                "client_id": config.get("LOGIN_CLIENT_ID") or "",
                "client_secret": config.get("LOGIN_CLIENT_SECRET") or "",
                "model": model_name(),
                "contents": prompt,
                "generation_config": {"maxOutputTokens": 4096, "responseMimeType": "application/json"},
                "user_email": user_email,
            },
            headers={"Content-Type": "application/json", "Accept": "application/json"},
            timeout=45,
        )
    except requests.RequestException as exc:
        raise PlatformError("Could not reach the login service.") from exc
    try:
        data = response.json()
    except ValueError as exc:
        raise PlatformError("The login service returned an unreadable response.") from exc
    if response.status_code >= 400:
        code = str(data.get("error") or "") if isinstance(data, dict) else ""
        raise PlatformError(
            _MESSAGES.get(code, "The login service refused the request."),
            _STATUS.get(code, 503),
            code,
        )
    text = data.get("text") if isinstance(data, dict) else None
    if not isinstance(text, str) or not text.strip():
        raise PlatformError("Gemini returned an empty answer.", 503, "gemini_unavailable")
    return text
