from __future__ import annotations

import sqlite3
from pathlib import Path
from typing import Any
import json


def init_db(path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(path)
    try:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS leads (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                bot_slug TEXT NOT NULL,
                scenario_slug TEXT NOT NULL,
                chat_id INTEGER NOT NULL,
                bitrix_lead_id INTEGER,
                username TEXT,
                full_name TEXT,
                phone TEXT,
                email TEXT,
                answers_json TEXT NOT NULL,
                bitrix_status TEXT NOT NULL DEFAULT 'pending',
                bitrix_error TEXT,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS bridge_state (
                bitrix_lead_id INTEGER PRIMARY KEY,
                chat_id INTEGER NOT NULL,
                last_timeline_comment_id INTEGER NOT NULL DEFAULT 0,
                last_status_semantic TEXT NOT NULL DEFAULT '',
                closed_notified INTEGER NOT NULL DEFAULT 0,
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS users (
                chat_id INTEGER PRIMARY KEY,
                consent_accepted INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                consent_at TEXT,
                last_bitrix_lead_id INTEGER,
                followup_count INTEGER NOT NULL DEFAULT 0
            )
            """
        )
        # Lightweight migration for existing DB
        existing_cols = {
            row[1]
            for row in conn.execute("PRAGMA table_info(users)").fetchall()
        }
        if "last_bitrix_lead_id" not in existing_cols:
            conn.execute("ALTER TABLE users ADD COLUMN last_bitrix_lead_id INTEGER")
        if "followup_count" not in existing_cols:
            conn.execute("ALTER TABLE users ADD COLUMN followup_count INTEGER NOT NULL DEFAULT 0")
        lead_cols = {
            row[1]
            for row in conn.execute("PRAGMA table_info(leads)").fetchall()
        }
        if "bitrix_lead_id" not in lead_cols:
            conn.execute("ALTER TABLE leads ADD COLUMN bitrix_lead_id INTEGER")
        bridge_cols = {
            row[1]
            for row in conn.execute("PRAGMA table_info(bridge_state)").fetchall()
        }
        if "last_status_semantic" not in bridge_cols:
            conn.execute("ALTER TABLE bridge_state ADD COLUMN last_status_semantic TEXT NOT NULL DEFAULT ''")
        if "closed_notified" not in bridge_cols:
            conn.execute("ALTER TABLE bridge_state ADD COLUMN closed_notified INTEGER NOT NULL DEFAULT 0")
        conn.commit()
    finally:
        conn.close()


def save_lead(
    path: Path,
    bot_slug: str,
    scenario_slug: str,
    chat_id: int,
    username: str,
    full_name: str,
    phone: str,
    email: str,
    answers: dict[str, Any],
) -> int:
    conn = sqlite3.connect(path)
    try:
        cur = conn.execute(
            """
            INSERT INTO leads(
                bot_slug, scenario_slug, chat_id, username,
                full_name, phone, email, answers_json
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                bot_slug,
                scenario_slug,
                chat_id,
                username,
                full_name,
                phone,
                email,
                json.dumps(answers, ensure_ascii=False),
            ),
        )
        conn.commit()
        return int(cur.lastrowid)
    finally:
        conn.close()


def update_bitrix_status(path: Path, lead_id: int, status: str, error: str = "") -> None:
    conn = sqlite3.connect(path)
    try:
        conn.execute(
            "UPDATE leads SET bitrix_status = ?, bitrix_error = ? WHERE id = ?",
            (status, error, lead_id),
        )
        conn.commit()
    finally:
        conn.close()


def set_lead_bitrix_id(path: Path, lead_row_id: int, bitrix_lead_id: int) -> None:
    conn = sqlite3.connect(path)
    try:
        conn.execute(
            "UPDATE leads SET bitrix_lead_id = ? WHERE id = ?",
            (bitrix_lead_id, lead_row_id),
        )
        conn.commit()
    finally:
        conn.close()


def has_user_consent(path: Path, chat_id: int) -> bool:
    conn = sqlite3.connect(path)
    try:
        row = conn.execute(
            "SELECT consent_accepted FROM users WHERE chat_id = ?",
            (chat_id,),
        ).fetchone()
        return bool(row and int(row[0]) == 1)
    finally:
        conn.close()


def set_user_consent(path: Path, chat_id: int) -> None:
    conn = sqlite3.connect(path)
    try:
        conn.execute(
            """
            INSERT INTO users(chat_id, consent_accepted, consent_at)
            VALUES (?, 1, CURRENT_TIMESTAMP)
            ON CONFLICT(chat_id) DO UPDATE SET
                consent_accepted = 1,
                consent_at = CURRENT_TIMESTAMP
            """,
            (chat_id,),
        )
        conn.commit()
    finally:
        conn.close()


def set_user_last_lead(path: Path, chat_id: int, bitrix_lead_id: int) -> None:
    conn = sqlite3.connect(path)
    try:
        conn.execute(
            """
            INSERT INTO users(chat_id, consent_accepted, last_bitrix_lead_id, followup_count)
            VALUES (?, 1, ?, 0)
            ON CONFLICT(chat_id) DO UPDATE SET
                last_bitrix_lead_id = excluded.last_bitrix_lead_id,
                followup_count = 0
            """,
            (chat_id, bitrix_lead_id),
        )
        conn.commit()
    finally:
        conn.close()


def get_user_last_lead(path: Path, chat_id: int) -> int | None:
    conn = sqlite3.connect(path)
    try:
        row = conn.execute(
            "SELECT last_bitrix_lead_id FROM users WHERE chat_id = ?",
            (chat_id,),
        ).fetchone()
        if not row or row[0] is None:
            return None
        return int(row[0])
    finally:
        conn.close()


def bump_followup_count(path: Path, chat_id: int) -> int:
    conn = sqlite3.connect(path)
    try:
        conn.execute(
            """
            INSERT INTO users(chat_id, consent_accepted, followup_count)
            VALUES (?, 1, 1)
            ON CONFLICT(chat_id) DO UPDATE SET
                followup_count = COALESCE(users.followup_count, 0) + 1
            """,
            (chat_id,),
        )
        row = conn.execute(
            "SELECT COALESCE(followup_count, 0) FROM users WHERE chat_id = ?",
            (chat_id,),
        ).fetchone()
        conn.commit()
        return int(row[0]) if row else 1
    finally:
        conn.close()


def upsert_bridge_state(path: Path, bitrix_lead_id: int, chat_id: int, last_comment_id: int = 0) -> None:
    conn = sqlite3.connect(path)
    try:
        conn.execute(
            """
            INSERT INTO bridge_state(bitrix_lead_id, chat_id, last_timeline_comment_id)
            VALUES (?, ?, ?)
            ON CONFLICT(bitrix_lead_id) DO UPDATE SET
                chat_id = excluded.chat_id,
                last_timeline_comment_id = CASE
                    WHEN excluded.last_timeline_comment_id > bridge_state.last_timeline_comment_id
                    THEN excluded.last_timeline_comment_id
                    ELSE bridge_state.last_timeline_comment_id
                END,
                updated_at = CURRENT_TIMESTAMP
            """,
            (bitrix_lead_id, chat_id, last_comment_id),
        )
        conn.commit()
    finally:
        conn.close()


def update_bridge_cursor(path: Path, bitrix_lead_id: int, last_comment_id: int) -> None:
    conn = sqlite3.connect(path)
    try:
        conn.execute(
            """
            UPDATE bridge_state
            SET last_timeline_comment_id = ?, updated_at = CURRENT_TIMESTAMP
            WHERE bitrix_lead_id = ?
            """,
            (last_comment_id, bitrix_lead_id),
        )
        conn.commit()
    finally:
        conn.close()


def get_bridge_records(path: Path) -> list[tuple[int, int, int]]:
    conn = sqlite3.connect(path)
    try:
        rows = conn.execute(
            """
            SELECT bitrix_lead_id, chat_id, last_timeline_comment_id
            FROM bridge_state
            ORDER BY updated_at DESC
            """
        ).fetchall()
        return [(int(r[0]), int(r[1]), int(r[2])) for r in rows]
    finally:
        conn.close()


def get_bridge_records_full(path: Path) -> list[tuple[int, int, int, str, int]]:
    conn = sqlite3.connect(path)
    try:
        rows = conn.execute(
            """
            SELECT bitrix_lead_id, chat_id, last_timeline_comment_id, last_status_semantic, closed_notified
            FROM bridge_state
            ORDER BY updated_at DESC
            """
        ).fetchall()
        return [
            (int(r[0]), int(r[1]), int(r[2]), str(r[3] or ""), int(r[4] or 0))
            for r in rows
        ]
    finally:
        conn.close()


def update_bridge_status(path: Path, bitrix_lead_id: int, status_semantic: str, closed_notified: int) -> None:
    conn = sqlite3.connect(path)
    try:
        conn.execute(
            """
            UPDATE bridge_state
            SET last_status_semantic = ?, closed_notified = ?, updated_at = CURRENT_TIMESTAMP
            WHERE bitrix_lead_id = ?
            """,
            (status_semantic, int(closed_notified), bitrix_lead_id),
        )
        conn.commit()
    finally:
        conn.close()
