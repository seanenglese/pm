from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_health_check() -> None:
    response = client.get("/api/health")

    assert response.status_code == 200
    assert response.json()["status"] == "ok"
    assert response.json()["service"] == "pm-mvp"


def test_root_serves_frontend_shell(tmp_path, monkeypatch) -> None:
    # The real static export only exists after a frontend build, so serve a stand-in.
    (tmp_path / "index.html").write_text("<title>Kanban Studio</title>")
    static = next(route.app for route in app.routes if getattr(route, "name", None) == "static")
    monkeypatch.setattr(static, "directory", tmp_path)
    monkeypatch.setattr(static, "all_directories", [tmp_path])

    response = client.get("/")

    assert response.status_code == 200
    assert "Kanban Studio" in response.text


def test_user_board_is_created_with_default_data() -> None:
    response = client.get("/api/users/user/board")

    assert response.status_code == 200
    assert response.json()["username"] == "user"
    assert response.json()["board"]["columns"]
    assert response.json()["board"]["cards"]


def test_user_board_can_be_updated() -> None:
    board = {
        "columns": [
            {"id": "col-backlog", "title": "Backlog", "cardIds": ["card-1"]}
        ],
        "cards": {
            "card-1": {
                "id": "card-1",
                "title": "Launch plan",
                "details": "Finalize the release checklist.",
            }
        },
    }

    response = client.put("/api/users/user/board", json=board)

    assert response.status_code == 200
    assert response.json()["board"]["columns"][0]["title"] == "Backlog"
    assert response.json()["board"]["cards"]["card-1"]["title"] == "Launch plan"

    follow_up = client.get("/api/users/user/board")
    assert follow_up.json()["board"]["cards"]["card-1"]["details"] == "Finalize the release checklist."


def test_board_creation_is_idempotent_across_repeated_reads() -> None:
    first = client.get("/api/users/new-user/board")
    second = client.get("/api/users/new-user/board")

    assert first.json()["board"] == second.json()["board"]


def test_board_survives_multiple_consecutive_updates() -> None:
    username = "repeat-updates-user"

    def board_with_title(title: str) -> dict:
        return {
            "columns": [{"id": "col-a", "title": "A", "cardIds": ["card-1"]}],
            "cards": {"card-1": {"id": "card-1", "title": title, "details": "pass"}},
        }

    for pass_number in range(1, 4):
        response = client.put(
            f"/api/users/{username}/board", json=board_with_title(f"Pass {pass_number}")
        )
        assert response.json()["board"]["cards"]["card-1"]["title"] == f"Pass {pass_number}"

    follow_up = client.get(f"/api/users/{username}/board")
    assert follow_up.json()["board"]["cards"]["card-1"]["title"] == "Pass 3"


def test_users_have_independent_boards() -> None:
    board_a = {
        "columns": [{"id": "col-a", "title": "Only A", "cardIds": []}],
        "cards": {},
    }

    client.put("/api/users/user-a/board", json=board_a)
    board_b = client.get("/api/users/user-b/board").json()["board"]

    assert board_b["columns"][0]["title"] != "Only A"


def test_board_update_rejects_invalid_payload() -> None:
    response = client.put(
        "/api/users/user/board",
        json={"columns": [{"id": "col-a", "title": "A"}], "cards": {}},
    )

    assert response.status_code == 422
