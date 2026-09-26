from fastapi.testclient import TestClient

from app import main
from app.ai import AIBoardResponse, AIConnectionError
from app.main import app
from app.models import BoardData

client = TestClient(app)


def test_chat_returns_reply_without_board_change(monkeypatch) -> None:
    async def fake_ask_about_board(board: dict, message: str, history: list[dict]):
        assert message == "How many cards are in Backlog?"
        assert history == []
        return AIBoardResponse(reply="There are 2 cards.", board_update=None)

    monkeypatch.setattr(main, "ask_about_board", fake_ask_about_board)

    response = client.post(
        "/api/users/chat-user/chat",
        json={"message": "How many cards are in Backlog?", "history": []},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["reply"] == "There are 2 cards."
    assert body["board"]["columns"]


def test_chat_persists_a_board_update(monkeypatch) -> None:
    new_board = {
        "columns": [{"id": "col-a", "title": "A", "cardIds": ["card-1"]}],
        "cards": {
            "card-1": {"id": "card-1", "title": "Renamed by AI", "details": "Notes."}
        },
    }

    async def fake_ask_about_board(board: dict, message: str, history: list[dict]):
        return AIBoardResponse(
            reply="Renamed it.", board_update=BoardData.model_validate(new_board)
        )

    monkeypatch.setattr(main, "ask_about_board", fake_ask_about_board)

    response = client.post(
        "/api/users/chat-user-2/chat",
        json={"message": "Rename the card", "history": []},
    )

    assert response.status_code == 200
    assert response.json()["board"]["cards"]["card-1"]["title"] == "Renamed by AI"

    follow_up = client.get("/api/users/chat-user-2/board")
    assert follow_up.json()["board"]["cards"]["card-1"]["title"] == "Renamed by AI"


def test_chat_sends_current_board_and_conversation_history(monkeypatch) -> None:
    captured: dict = {}

    async def fake_ask_about_board(board: dict, message: str, history: list[dict]):
        captured["board"] = board
        captured["history"] = history
        return AIBoardResponse(reply="ok", board_update=None)

    monkeypatch.setattr(main, "ask_about_board", fake_ask_about_board)

    client.post(
        "/api/users/chat-user-3/chat",
        json={
            "message": "and then?",
            "history": [
                {"role": "user", "content": "hi"},
                {"role": "assistant", "content": "hello"},
            ],
        },
    )

    assert captured["history"] == [
        {"role": "user", "content": "hi"},
        {"role": "assistant", "content": "hello"},
    ]
    assert "columns" in captured["board"]
    assert "cards" in captured["board"]


def test_chat_returns_502_when_ai_fails(monkeypatch) -> None:
    async def failing_ask_about_board(board: dict, message: str, history: list[dict]):
        raise AIConnectionError("boom")

    monkeypatch.setattr(main, "ask_about_board", failing_ask_about_board)

    response = client.post(
        "/api/users/chat-user-4/chat",
        json={"message": "hi", "history": []},
    )

    assert response.status_code == 502


def test_chat_rejects_disallowed_history_role() -> None:
    response = client.post(
        "/api/users/chat-user-5/chat",
        json={"message": "hi", "history": [{"role": "system", "content": "nope"}]},
    )

    assert response.status_code == 422
