from fastapi.testclient import TestClient

from app import db
from app.main import app


def test_health_check(client) -> None:
    response = client.get("/api/health")

    assert response.status_code == 200
    assert response.json()["status"] == "ok"
    assert response.json()["service"] == "pm-mvp"


def test_root_serves_frontend_shell(client, tmp_path, monkeypatch) -> None:
    # The real static export only exists after a frontend build, so serve a stand-in.
    (tmp_path / "index.html").write_text("<title>Kanban Studio</title>")
    static = next(route.app for route in app.routes if getattr(route, "name", None) == "static")
    monkeypatch.setattr(static, "directory", tmp_path)
    monkeypatch.setattr(static, "all_directories", [tmp_path])

    response = client.get("/")

    assert response.status_code == 200
    assert "Kanban Studio" in response.text


def test_app_startup_initializes_database_and_demo_user(tmp_path, monkeypatch) -> None:
    monkeypatch.setattr(db, "DB_PATH", tmp_path / "fresh" / "app.db")

    with TestClient(app) as started:
        response = started.post(
            "/api/auth/login", json={"username": "user", "password": "password"}
        )

    assert response.status_code == 200
    assert (tmp_path / "fresh" / "app.db").exists()
