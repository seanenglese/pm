import itertools

import pytest
from fastapi.testclient import TestClient

from app import auth, db
from app.main import app

_usernames = itertools.count(1)


@pytest.fixture(autouse=True)
def isolated_db(tmp_path, monkeypatch):
    monkeypatch.setattr(db, "DB_PATH", tmp_path / "test.db")
    db.init_db()
    auth.ensure_demo_user()


@pytest.fixture
def client() -> TestClient:
    return TestClient(app)


@pytest.fixture
def register(client):
    """Create a new account and return (headers, user) for it."""

    def _register(username: str | None = None, password: str = "correct-horse"):
        username = username or f"member{next(_usernames)}"
        response = client.post(
            "/api/auth/register", json={"username": username, "password": password}
        )
        assert response.status_code == 201, response.text
        body = response.json()
        return {"Authorization": f"Bearer {body['token']}"}, body["user"]

    return _register


@pytest.fixture
def headers(register) -> dict:
    return register()[0]


@pytest.fixture
def board_id(client, headers) -> int:
    """The starter board every new account gets."""
    return client.get("/api/boards", headers=headers).json()[0]["id"]
