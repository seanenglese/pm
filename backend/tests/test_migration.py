import json
import sqlite3

from app import auth, db


def _make_legacy_database(path) -> None:
    """The pre-accounts schema: one board per user keyed by user_id, no passwords."""
    connection = sqlite3.connect(path)
    connection.executescript(
        """
        CREATE TABLE users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT NOT NULL UNIQUE,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE boards (
            user_id INTEGER PRIMARY KEY,
            board_json TEXT NOT NULL,
            updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(user_id) REFERENCES users(id)
        );
        """
    )
    legacy_board = {
        "columns": [{"id": "col-a", "title": "Kept", "cardIds": []}],
        "cards": {},
    }
    connection.execute("INSERT INTO users (username) VALUES ('user'), ('other')")
    connection.execute(
        "INSERT INTO boards (user_id, board_json) VALUES (1, ?)", (json.dumps(legacy_board),)
    )
    connection.commit()
    connection.close()


def test_legacy_database_is_migrated_and_keeps_boards(client, tmp_path, monkeypatch) -> None:
    path = tmp_path / "legacy.db"
    _make_legacy_database(path)
    monkeypatch.setattr(db, "DB_PATH", path)

    db.init_db()
    auth.ensure_demo_user()

    login = client.post("/api/auth/login", json={"username": "user", "password": "password"})
    assert login.status_code == 200
    headers = {"Authorization": f"Bearer {login.json()['token']}"}

    boards = client.get("/api/boards", headers=headers).json()
    assert [board["name"] for board in boards] == ["My board"]
    detail = client.get(f"/api/boards/{boards[0]['id']}", headers=headers).json()
    assert detail["board"]["columns"][0]["title"] == "Kept"

    # Legacy users other than the demo account have no password and cannot sign in.
    other = client.post("/api/auth/login", json={"username": "other", "password": "password"})
    assert other.status_code == 401

    with db.db_connection() as connection:
        assert connection.execute("PRAGMA user_version").fetchone()[0] == db.SCHEMA_VERSION
        tables = {
            row[0]
            for row in connection.execute("SELECT name FROM sqlite_master WHERE type = 'table'")
        }
    assert "boards_legacy" not in tables


def test_init_db_is_idempotent(client, headers, board_id) -> None:
    db.init_db()
    db.init_db()

    assert client.get(f"/api/boards/{board_id}", headers=headers).status_code == 200


def test_deleting_a_user_cascades_to_boards_and_sessions(client, register) -> None:
    headers, user = register()

    with db.db_connection() as connection:
        connection.execute("DELETE FROM users WHERE id = ?", (user["id"],))
        boards = connection.execute(
            "SELECT COUNT(*) FROM boards WHERE user_id = ?", (user["id"],)
        ).fetchone()[0]
        sessions = connection.execute(
            "SELECT COUNT(*) FROM sessions WHERE user_id = ?", (user["id"],)
        ).fetchone()[0]

    assert boards == 0
    assert sessions == 0
    assert client.get("/api/auth/me", headers=headers).status_code == 401
