import json
import sqlite3
from contextlib import contextmanager
from pathlib import Path

DB_PATH = Path(__file__).resolve().parent.parent / "data" / "pm_mvp.db"

SCHEMA_VERSION = 1

# Seed for a new account's first board. initialData in frontend/src/lib/kanban.ts
# is an independent copy used as a test fixture; keep them in sync.
DEFAULT_BOARD = {
    "columns": [
        {"id": "col-backlog", "title": "Backlog", "cardIds": ["card-1", "card-2"]},
        {"id": "col-discovery", "title": "Discovery", "cardIds": ["card-3"]},
        {
            "id": "col-progress",
            "title": "In Progress",
            "cardIds": ["card-4", "card-5"],
        },
        {"id": "col-review", "title": "Review", "cardIds": ["card-6"]},
        {"id": "col-done", "title": "Done", "cardIds": ["card-7", "card-8"]},
    ],
    "cards": {
        "card-1": {
            "id": "card-1",
            "title": "Align roadmap themes",
            "details": "Draft quarterly themes with impact statements and metrics.",
            "priority": "high",
            "dueDate": None,
            "labels": ["planning"],
        },
        "card-2": {
            "id": "card-2",
            "title": "Gather customer signals",
            "details": "Review support tags, sales notes, and churn feedback.",
            "priority": "medium",
            "dueDate": None,
            "labels": ["research"],
        },
        "card-3": {
            "id": "card-3",
            "title": "Prototype analytics view",
            "details": "Sketch initial dashboard layout and key drill-downs.",
            "priority": "medium",
            "dueDate": None,
            "labels": ["design"],
        },
        "card-4": {
            "id": "card-4",
            "title": "Refine status language",
            "details": "Standardize column labels and tone across the board.",
            "priority": "low",
            "dueDate": None,
            "labels": ["content"],
        },
        "card-5": {
            "id": "card-5",
            "title": "Design card layout",
            "details": "Add hierarchy and spacing for scanning dense lists.",
            "priority": "high",
            "dueDate": None,
            "labels": ["design"],
        },
        "card-6": {
            "id": "card-6",
            "title": "QA micro-interactions",
            "details": "Verify hover, focus, and loading states.",
            "priority": "medium",
            "dueDate": None,
            "labels": ["qa"],
        },
        "card-7": {
            "id": "card-7",
            "title": "Ship marketing page",
            "details": "Final copy approved and asset pack delivered.",
            "priority": None,
            "dueDate": None,
            "labels": ["marketing"],
        },
        "card-8": {
            "id": "card-8",
            "title": "Close onboarding sprint",
            "details": "Document release notes and share internally.",
            "priority": "low",
            "dueDate": None,
            "labels": [],
        },
    },
}

# Starting layout for boards a user creates themselves.
BLANK_BOARD = {
    "columns": [
        {"id": "col-todo", "title": "To Do", "cardIds": []},
        {"id": "col-progress", "title": "In Progress", "cardIds": []},
        {"id": "col-review", "title": "Review", "cardIds": []},
        {"id": "col-done", "title": "Done", "cardIds": []},
    ],
    "cards": {},
}


@contextmanager
def db_connection():
    connection = sqlite3.connect(DB_PATH)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    try:
        yield connection
        connection.commit()
    finally:
        connection.close()


def create_board(
    connection: sqlite3.Connection, user_id: int, name: str, sample: bool = False
) -> int:
    board = DEFAULT_BOARD if sample else BLANK_BOARD
    cursor = connection.execute(
        "INSERT INTO boards (user_id, name, board_json) VALUES (?, ?, ?)",
        (user_id, name, json.dumps(board)),
    )
    return cursor.lastrowid


def _create_tables(connection: sqlite3.Connection) -> None:
    connection.execute(
        """
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT NOT NULL UNIQUE,
            password_hash TEXT,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
        """
    )
    connection.execute(
        """
        CREATE TABLE IF NOT EXISTS sessions (
            token_hash TEXT PRIMARY KEY,
            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            expires_at INTEGER NOT NULL
        )
        """
    )
    connection.execute(
        """
        CREATE TABLE IF NOT EXISTS boards (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            name TEXT NOT NULL,
            board_json TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
        """
    )


def _migrate_from_single_board(connection: sqlite3.Connection) -> None:
    """Upgrade a pre-accounts database: one board per user, no passwords.

    Existing users keep their board (renamed "My board") but have no password,
    so they cannot sign in until one is set (the demo user gets one on startup).
    """
    connection.execute("ALTER TABLE users ADD COLUMN password_hash TEXT")
    connection.execute("ALTER TABLE boards RENAME TO boards_legacy")
    _create_tables(connection)
    connection.execute(
        """
        INSERT INTO boards (user_id, name, board_json, updated_at)
        SELECT user_id, 'My board', board_json, updated_at FROM boards_legacy
        """
    )
    connection.execute("DROP TABLE boards_legacy")


def init_db() -> None:
    DB_PATH.parent.mkdir(exist_ok=True)
    with db_connection() as connection:
        version = connection.execute("PRAGMA user_version").fetchone()[0]
        if version == 0:
            board_columns = {
                row["name"]
                for row in connection.execute("PRAGMA table_info(boards)")
            }
            if board_columns and "id" not in board_columns:
                _migrate_from_single_board(connection)
            else:
                _create_tables(connection)
            connection.execute(f"PRAGMA user_version = {SCHEMA_VERSION}")
