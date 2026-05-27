from __future__ import annotations

import sqlite3
import threading
from datetime import datetime, timezone
from pathlib import Path


_DB_LOCK = threading.Lock()
_DB_PATH = Path(__file__).resolve().parent.parent / "data" / "users.db"


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _get_connection() -> sqlite3.Connection:
    _DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(_DB_PATH)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA journal_mode=WAL;")
    return connection


def _ensure_schema() -> None:
    with _DB_LOCK, _get_connection() as connection:
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS oauth_users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                provider TEXT NOT NULL,
                provider_user_id TEXT NOT NULL,
                email TEXT NOT NULL,
                name TEXT,
                picture TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                UNIQUE(provider, provider_user_id),
                UNIQUE(email)
            )
            """
        )
        connection.commit()


def upsert_oauth_user(
    *,
    provider: str,
    provider_user_id: str,
    email: str,
    name: str | None = None,
    picture: str | None = None,
) -> dict:
    provider = provider.strip().lower()
    provider_user_id = provider_user_id.strip()
    email = email.strip().lower()
    name = (name or "").strip()
    picture = (picture or "").strip()

    if not provider or not provider_user_id or not email:
        raise ValueError("provider, provider_user_id, and email are required")

    _ensure_schema()
    now = _utc_now()

    with _DB_LOCK, _get_connection() as connection:
        existing = connection.execute(
            "SELECT * FROM oauth_users WHERE provider = ? AND provider_user_id = ?",
            (provider, provider_user_id),
        ).fetchone()

        if existing is not None:
            connection.execute(
                """
                UPDATE oauth_users
                SET email = ?, name = ?, picture = ?, updated_at = ?
                WHERE id = ?
                """,
                (email, name, picture, now, existing["id"]),
            )
            connection.commit()
            row = connection.execute("SELECT * FROM oauth_users WHERE id = ?", (existing["id"],)).fetchone()
            return dict(row)

        email_match = connection.execute(
            "SELECT * FROM oauth_users WHERE email = ? ORDER BY updated_at DESC LIMIT 1",
            (email,),
        ).fetchone()

        if email_match is not None:
            connection.execute(
                """
                UPDATE oauth_users
                SET provider = ?, provider_user_id = ?, name = ?, picture = ?, updated_at = ?
                WHERE id = ?
                """,
                (provider, provider_user_id, name, picture, now, email_match["id"]),
            )
            connection.commit()
            row = connection.execute("SELECT * FROM oauth_users WHERE id = ?", (email_match["id"],)).fetchone()
            return dict(row)

        cursor = connection.execute(
            """
            INSERT INTO oauth_users (provider, provider_user_id, email, name, picture, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (provider, provider_user_id, email, name, picture, now, now),
        )
        connection.commit()
        row = connection.execute("SELECT * FROM oauth_users WHERE id = ?", (cursor.lastrowid,)).fetchone()
        return dict(row)