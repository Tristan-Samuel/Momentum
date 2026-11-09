from __future__ import annotations

import os
from datetime import timedelta
from pathlib import Path

from dotenv import load_dotenv

SERVER_DIR = Path(__file__).resolve().parent.parent
ROOT_DIR = SERVER_DIR.parent
load_dotenv(ROOT_DIR / ".env")

DATA_DIR = Path(os.environ.get("MOMENTUM_DATA_DIR", str(SERVER_DIR / "instance")))
DB_PATH = Path(os.environ.get("MOMENTUM_DB_PATH", str(DATA_DIR / "momentum.db")))
DEV_SECRET = "dev-momentum-secret"
PUBLIC_BASE_URL = os.environ.get("MOMENTUM_PUBLIC_BASE_URL", "").strip().rstrip("/")
DEFAULT_APP_REDIRECTS = "com.momentum.workout://auth/callback"
DEFAULT_CORS_ORIGINS = "capacitor://localhost,http://localhost,http://localhost:5173,http://localhost:4173"


def _csv(name: str, default: str = "") -> tuple[str, ...]:
    raw = os.environ.get(name, default)
    return tuple(item.strip() for item in raw.split(",") if item.strip())


class Config:
    MOMENTUM_DATA_DIR = str(DATA_DIR)
    MOMENTUM_DB_PATH = str(DB_PATH)
    SECRET_KEY = os.environ.get("MOMENTUM_SECRET_KEY", "") or DEV_SECRET
    PUBLIC_BASE_URL = PUBLIC_BASE_URL
    LOGIN_URL = os.environ.get("LOGIN_URL", "").strip().rstrip("/")
    LOGIN_TOKEN_URL = os.environ.get("LOGIN_TOKEN_URL", "http://127.0.0.1:5111").strip().rstrip("/")
    LOGIN_CLIENT_ID = os.environ.get("LOGIN_CLIENT_ID", "momentum").strip()
    LOGIN_CLIENT_SECRET = os.environ.get("LOGIN_CLIENT_SECRET", "").strip()
    LOGIN_REDIRECT_URI = os.environ.get("LOGIN_REDIRECT_URI", "").strip()
    MOMENTUM_ADMIN_EMAILS = tuple(email.lower() for email in _csv("MOMENTUM_ADMIN_EMAILS"))
    MOMENTUM_APP_REDIRECTS = _csv("MOMENTUM_APP_REDIRECTS", DEFAULT_APP_REDIRECTS)
    MOMENTUM_CORS_ORIGINS = _csv("MOMENTUM_CORS_ORIGINS", DEFAULT_CORS_ORIGINS)
    HANDOFF_TTL_SECONDS = 60
    PUSH_MAX_RECORDS = 500
    MAX_CONTENT_LENGTH = int(os.environ.get("MOMENTUM_MAX_UPLOAD_MB", "5")) * 1024 * 1024
    PERMANENT_SESSION_LIFETIME = timedelta(days=30)
    SESSION_COOKIE_HTTPONLY = True
    SESSION_COOKIE_SAMESITE = "Lax"
    SESSION_COOKIE_SECURE = PUBLIC_BASE_URL.startswith("https://")
    JSON_SORT_KEYS = False
    TEMPLATES_AUTO_RELOAD = True
