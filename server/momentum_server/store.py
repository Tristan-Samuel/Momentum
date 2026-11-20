from __future__ import annotations

import hashlib
import json
import secrets
import sqlite3
from datetime import datetime, timedelta, timezone
from typing import Any, Iterable

from flask import current_app, g

SYNC_TABLES = (
    "workoutPrograms",
    "exercises",
    "exerciseConfigurations",
    "progressionStates",
    "workoutSessions",
    "exerciseSessions",
    "setSessions",
    "personalRecords",
    "appSettings",
    "routines",
)

SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY,
    sub TEXT NOT NULL UNIQUE,
    email TEXT NOT NULL,
    name TEXT NOT NULL DEFAULT '',
    role TEXT NOT NULL DEFAULT 'user',
    created_at TEXT NOT NULL,
    last_login_at TEXT,
    last_sync_at TEXT,
    sync_epoch INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS users_email ON users(email);
CREATE TABLE IF NOT EXISTS device_tokens (
    id INTEGER PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id),
    token_hash TEXT NOT NULL UNIQUE,
    label TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    last_used_at TEXT,
    revoked_at TEXT
);
CREATE TABLE IF NOT EXISTS handoff_codes (
    code_hash TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id),
    challenge TEXT NOT NULL,
    redirect_uri TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    used_at TEXT
);
CREATE TABLE IF NOT EXISTS records (
    user_id INTEGER NOT NULL REFERENCES users(id),
    tbl TEXT NOT NULL,
    id TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted INTEGER NOT NULL DEFAULT 0,
    data TEXT,
    rev INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (user_id, tbl, id)
);
"""


def now() -> datetime:
    return datetime.now(timezone.utc)


def iso(moment: datetime | None = None) -> str:
    return (moment or now()).isoformat(timespec="seconds").replace("+00:00", "Z")


def hash_secret(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def init_db(path: str) -> None:
    conn = sqlite3.connect(path)
    try:
        conn.executescript(SCHEMA)
        _migrate(conn)
        conn.commit()
    finally:
        conn.close()


def _migrate(conn: sqlite3.Connection) -> None:
    """Adds columns that CREATE TABLE IF NOT EXISTS will not add to an existing file."""
    user_cols = {row[1] for row in conn.execute("PRAGMA table_info(users)")}
    if "sync_epoch" not in user_cols:
        conn.execute("ALTER TABLE users ADD COLUMN sync_epoch INTEGER NOT NULL DEFAULT 0")
    record_cols = {row[1] for row in conn.execute("PRAGMA table_info(records)")}
    if "rev" not in record_cols:
        conn.execute("ALTER TABLE records ADD COLUMN rev INTEGER NOT NULL DEFAULT 0")
        conn.execute("UPDATE records SET rev = rowid WHERE rev = 0")


def get_db() -> sqlite3.Connection:
    if "db" not in g:
        conn = sqlite3.connect(current_app.config["MOMENTUM_DB_PATH"], timeout=10)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys = ON")
        conn.execute("PRAGMA journal_mode = WAL")
        g.db = conn
    return g.db


def close_db(_exc: BaseException | None = None) -> None:
    conn = g.pop("db", None)
    if conn is not None:
        conn.close()


# Users


def upsert_user(*, sub: str, email: str, name: str) -> sqlite3.Row:
    db = get_db()
    row = db.execute("SELECT * FROM users WHERE sub = ?", (sub,)).fetchone()
    if row is None:
        row = db.execute("SELECT * FROM users WHERE email = ? ORDER BY id LIMIT 1", (email,)).fetchone()
    stamp = iso()
    if row is None:
        cur = db.execute(
            "INSERT INTO users (sub, email, name, created_at, last_login_at) VALUES (?, ?, ?, ?, ?)",
            (sub, email, name, stamp, stamp),
        )
        user_id = cur.lastrowid
    else:
        user_id = row["id"]
        db.execute(
            "UPDATE users SET sub = ?, email = ?, name = COALESCE(NULLIF(?, ''), name), last_login_at = ? WHERE id = ?",
            (sub, email, name, stamp, user_id),
        )
    db.commit()
    return db.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()


def get_user(user_id: int) -> sqlite3.Row | None:
    return get_db().execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()


def list_users() -> list[sqlite3.Row]:
    return get_db().execute("SELECT * FROM users ORDER BY COALESCE(last_sync_at, created_at) DESC").fetchall()


def is_admin_email(email: str) -> bool:
    return email.strip().lower() in current_app.config.get("MOMENTUM_ADMIN_EMAILS", ())


# Handoff codes (PKCE)


def create_handoff(*, user_id: int, challenge: str, redirect_uri: str) -> str:
    code = secrets.token_urlsafe(32)
    ttl = int(current_app.config.get("HANDOFF_TTL_SECONDS", 60))
    db = get_db()
    db.execute("DELETE FROM handoff_codes WHERE expires_at < ?", (iso(now() - timedelta(hours=1)),))
    db.execute(
        "INSERT INTO handoff_codes (code_hash, user_id, challenge, redirect_uri, expires_at) VALUES (?, ?, ?, ?, ?)",
        (hash_secret(code), user_id, challenge, redirect_uri, iso(now() + timedelta(seconds=ttl))),
    )
    db.commit()
    return code


def consume_handoff(code: str) -> sqlite3.Row | None:
    """Marks the code used and returns it, or None if unknown, used, or expired."""
    db = get_db()
    row = db.execute("SELECT * FROM handoff_codes WHERE code_hash = ?", (hash_secret(code),)).fetchone()
    if row is None or row["used_at"] is not None:
        return None
    cur = db.execute(
        "UPDATE handoff_codes SET used_at = ? WHERE code_hash = ? AND used_at IS NULL",
        (iso(), row["code_hash"]),
    )
    db.commit()
    if cur.rowcount != 1 or row["expires_at"] < iso():
        return None
    return row


# Device tokens


def issue_device_token(user_id: int, label: str) -> str:
    token = secrets.token_urlsafe(32)
    db = get_db()
    db.execute(
        "INSERT INTO device_tokens (user_id, token_hash, label, created_at) VALUES (?, ?, ?, ?)",
        (user_id, hash_secret(token), label[:120], iso()),
    )
    db.commit()
    return token


def user_for_token(token: str) -> sqlite3.Row | None:
    db = get_db()
    row = db.execute(
        "SELECT u.*, t.id AS token_id FROM device_tokens t JOIN users u ON u.id = t.user_id "
        "WHERE t.token_hash = ? AND t.revoked_at IS NULL",
        (hash_secret(token),),
    ).fetchone()
    if row is not None:
        db.execute("UPDATE device_tokens SET last_used_at = ? WHERE id = ?", (iso(), row["token_id"]))
        db.commit()
    return row


def device_token_active(user_id: int, token: str) -> bool:
    row = get_db().execute(
        "SELECT 1 FROM device_tokens WHERE user_id = ? AND token_hash = ? AND revoked_at IS NULL",
        (user_id, hash_secret(token)),
    ).fetchone()
    return row is not None


def revoke_token(token_id: int) -> None:
    db = get_db()
    db.execute("UPDATE device_tokens SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL", (iso(), token_id))
    db.commit()


def list_devices(user_id: int) -> list[sqlite3.Row]:
    return (
        get_db()
        .execute(
            "SELECT id, label, created_at, last_used_at, revoked_at FROM device_tokens "
            "WHERE user_id = ? ORDER BY created_at DESC",
            (user_id,),
        )
        .fetchall()
    )


# Records


class RecordError(ValueError):
    pass


def _validated(record: Any) -> tuple[str, str, bool, str | None, str]:
    if not isinstance(record, dict):
        raise RecordError("Each record must be an object.")
    table = record.get("table")
    record_id = record.get("id")
    if table not in SYNC_TABLES:
        raise RecordError(f"Unknown table: {str(table)[:40]}")
    if not isinstance(record_id, str) or not record_id or len(record_id) > 128:
        raise RecordError("Each record needs a string id.")
    deleted = bool(record.get("deleted"))
    stamp = record.get("updatedAt") if isinstance(record.get("updatedAt"), str) else ""
    data = record.get("data")
    if deleted:
        payload = None
        if stamp:
            payload = json.dumps({"id": record_id, "updatedAt": stamp}, separators=(",", ":"))
        return table, record_id, True, payload, stamp
    if not isinstance(data, dict) or data.get("id") != record_id:
        raise RecordError("Record data must be an object with a matching id.")
    return table, record_id, False, json.dumps(data, separators=(",", ":")), ""


def _updated_at(data: str | None) -> str:
    if not data:
        return ""
    try:
        parsed = json.loads(data)
    except json.JSONDecodeError:
        return ""
    value = parsed.get("updatedAt") if isinstance(parsed, dict) else None
    return value if isinstance(value, str) else ""


def _max_rev(db: sqlite3.Connection, user_id: int) -> int:
    row = db.execute("SELECT COALESCE(MAX(rev), 0) FROM records WHERE user_id = ?", (user_id,)).fetchone()
    return int(row[0])


def _write_record(
    db: sqlite3.Connection,
    user_id: int,
    table: str,
    record_id: str,
    deleted: bool,
    data: str | None,
    rev: int,
    stamp: str,
) -> None:
    db.execute(
        "INSERT INTO records (user_id, tbl, id, updated_at, deleted, data, rev) VALUES (?, ?, ?, ?, ?, ?, ?) "
        "ON CONFLICT(user_id, tbl, id) DO UPDATE SET updated_at = excluded.updated_at, "
        "deleted = excluded.deleted, data = excluded.data, rev = excluded.rev",
        (user_id, table, record_id, stamp, int(deleted), data, rev),
    )


def apply_records(user_id: int, records: Iterable[Any]) -> int:
    """Keeps a row when its updatedAt is newer. An older put or delete is ignored."""
    rows = [_validated(record) for record in records]
    stamp = iso()
    db = get_db()
    rev = _max_rev(db, user_id)
    accepted = 0
    for table, record_id, deleted, data, deleted_at in rows:
        existing = db.execute(
            "SELECT data FROM records WHERE user_id = ? AND tbl = ? AND id = ?",
            (user_id, table, record_id),
        ).fetchone()
        stored_at = _updated_at(existing["data"]) if existing is not None else ""
        incoming_at = deleted_at if deleted else _updated_at(data)
        if existing is not None and incoming_at and stored_at and incoming_at <= stored_at:
            continue
        rev += 1
        _write_record(db, user_id, table, record_id, deleted, data, rev, stamp)
        accepted += 1
    if accepted:
        db.execute("UPDATE users SET last_sync_at = ? WHERE id = ?", (stamp, user_id))
    db.commit()
    return accepted


def replace_all(user_id: int, tables: dict[str, list[Any]]) -> int:
    """Replaces every record for the user. Bumps sync_epoch so other devices take the snapshot."""
    records: list[dict[str, Any]] = []
    for table, items in tables.items():
        if table not in SYNC_TABLES:
            raise RecordError(f"Unknown table: {str(table)[:40]}")
        if not isinstance(items, list):
            raise RecordError("Each table must be a list.")
        for item in items:
            record_id = item.get("id") if isinstance(item, dict) else None
            records.append({"table": table, "id": record_id, "data": item})
    rows = [_validated(record) for record in records]
    stamp = iso()
    db = get_db()
    db.execute("DELETE FROM records WHERE user_id = ?", (user_id,))
    for index, (table, record_id, _deleted, data, _stamp) in enumerate(rows, start=1):
        _write_record(db, user_id, table, record_id, False, data, index, stamp)
    db.execute(
        "UPDATE users SET last_sync_at = ?, sync_epoch = COALESCE(sync_epoch, 0) + 1 WHERE id = ?",
        (stamp, user_id),
    )
    db.commit()
    return len(rows)


def sync_epoch(user_id: int) -> int:
    row = get_db().execute("SELECT sync_epoch FROM users WHERE id = ?", (user_id,)).fetchone()
    if row is None or row["sync_epoch"] is None:
        return 0
    return int(row["sync_epoch"])


def changes_since(user_id: int, since_rev: int) -> tuple[list[dict[str, Any]], int, int]:
    """Rows with rev greater than since_rev, including deletes. Cursor is the current max rev."""
    db = get_db()
    current = _max_rev(db, user_id)
    rows = db.execute(
        "SELECT tbl, id, deleted, data FROM records "
        "WHERE user_id = ? AND rev > ? AND rev <= ? ORDER BY rev, tbl, id",
        (user_id, since_rev, current),
    ).fetchall()
    result: list[dict[str, Any]] = []
    for row in rows:
        if row["deleted"] or not row["data"]:
            result.append({"table": row["tbl"], "id": row["id"], "deleted": True})
        else:
            result.append({"table": row["tbl"], "id": row["id"], "data": json.loads(row["data"])})
    return result, current, sync_epoch(user_id)


def load_tables(user_id: int) -> dict[str, list[dict[str, Any]]]:
    tables: dict[str, list[dict[str, Any]]] = {name: [] for name in SYNC_TABLES}
    rows = get_db().execute(
        "SELECT tbl, data FROM records WHERE user_id = ? AND deleted = 0 ORDER BY tbl, id",
        (user_id,),
    )
    for row in rows:
        if row["tbl"] in tables and row["data"]:
            tables[row["tbl"]].append(json.loads(row["data"]))
    return tables


def record_counts(user_id: int) -> dict[str, int]:
    rows = get_db().execute(
        "SELECT tbl, COUNT(*) AS n FROM records WHERE user_id = ? AND deleted = 0 GROUP BY tbl",
        (user_id,),
    )
    return {row["tbl"]: row["n"] for row in rows}
