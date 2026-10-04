from app import boards
from app.ai import AIBoardResponse, AIConnectionError
from app.models import BoardData

NEW_BOARD = {
    "columns": [{"id": "col-a", "title": "A", "cardIds": ["card-1"]}],
    "cards": {
        "card-1": {
            "id": "card-1",
            "title": "Renamed by AI",
            "details": "Notes.",
            "priority": "high",
            "dueDate": "2026-11-20",
            "labels": ["ai"],
        }
    },
}


def _fake_ai(monkeypatch, reply="ok", board_update=None, captured=None):
    async def fake_ask_about_board(board: dict, message: str, history: list[dict]):
        if captured is not None:
            captured.update(board=board, message=message, history=history)
        update = BoardData.model_validate(board_update) if board_update else None
        return AIBoardResponse(reply=reply, board_update=update)

    monkeypatch.setattr(boards, "ask_about_board", fake_ask_about_board)


def test_chat_returns_reply_without_board_change(client, headers, board_id, monkeypatch) -> None:
    captured: dict = {}
    _fake_ai(monkeypatch, reply="There are 2 cards.", captured=captured)

    response = client.post(
        f"/api/boards/{board_id}/chat",
        headers=headers,
        json={"message": "How many cards are in Backlog?", "history": []},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["reply"] == "There are 2 cards."
    assert body["board"]["columns"]
    assert captured["message"] == "How many cards are in Backlog?"


def test_chat_persists_a_board_update(client, headers, board_id, monkeypatch) -> None:
    _fake_ai(monkeypatch, reply="Renamed it.", board_update=NEW_BOARD)

    response = client.post(
        f"/api/boards/{board_id}/chat",
        headers=headers,
        json={"message": "Rename the card"},
    )

    assert response.status_code == 200
    assert response.json()["board"] == NEW_BOARD
    follow_up = client.get(f"/api/boards/{board_id}", headers=headers)
    assert follow_up.json()["board"] == NEW_BOARD


def test_chat_only_changes_the_board_it_was_sent_to(client, headers, board_id, monkeypatch) -> None:
    other_id = client.post("/api/boards", headers=headers, json={"name": "Other"}).json()["id"]
    before = client.get(f"/api/boards/{board_id}", headers=headers).json()["board"]
    _fake_ai(monkeypatch, board_update=NEW_BOARD)

    client.post(f"/api/boards/{other_id}/chat", headers=headers, json={"message": "go"})

    assert client.get(f"/api/boards/{board_id}", headers=headers).json()["board"] == before
    assert client.get(f"/api/boards/{other_id}", headers=headers).json()["board"] == NEW_BOARD


def test_chat_sends_current_board_and_conversation_history(
    client, headers, board_id, monkeypatch
) -> None:
    captured: dict = {}
    _fake_ai(monkeypatch, captured=captured)
    history = [
        {"role": "user", "content": "hi"},
        {"role": "assistant", "content": "hello"},
    ]

    client.post(
        f"/api/boards/{board_id}/chat",
        headers=headers,
        json={"message": "and then?", "history": history},
    )

    assert captured["history"] == history
    assert captured["board"] == client.get(f"/api/boards/{board_id}", headers=headers).json()["board"]


def test_chat_drops_update_if_board_was_deleted_meanwhile(
    client, headers, board_id, monkeypatch
) -> None:
    async def delete_then_reply(board: dict, message: str, history: list[dict]):
        client.delete(f"/api/boards/{board_id}", headers=headers)
        return AIBoardResponse(reply="ok", board_update=BoardData.model_validate(NEW_BOARD))

    monkeypatch.setattr(boards, "ask_about_board", delete_then_reply)

    response = client.post(f"/api/boards/{board_id}/chat", headers=headers, json={"message": "go"})

    assert response.status_code == 404


def test_chat_returns_502_when_ai_fails(client, headers, board_id, monkeypatch) -> None:
    async def failing_ask_about_board(board: dict, message: str, history: list[dict]):
        raise AIConnectionError("boom")

    monkeypatch.setattr(boards, "ask_about_board", failing_ask_about_board)

    response = client.post(
        f"/api/boards/{board_id}/chat", headers=headers, json={"message": "hi"}
    )

    assert response.status_code == 502


def test_chat_rejects_disallowed_history_role(client, headers, board_id) -> None:
    response = client.post(
        f"/api/boards/{board_id}/chat",
        headers=headers,
        json={"message": "hi", "history": [{"role": "system", "content": "nope"}]},
    )

    assert response.status_code == 422


def test_chat_requires_authentication(client, board_id) -> None:
    response = client.post(f"/api/boards/{board_id}/chat", json={"message": "hi"})

    assert response.status_code == 401
