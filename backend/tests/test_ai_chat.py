import asyncio
import json

import pytest

from app import ai
from app.ai import AIConnectionError, ask_about_board
from app.models import BoardData

SAMPLE_BOARD = {
    "columns": [{"id": "col-a", "title": "A", "cardIds": ["card-1"]}],
    "cards": {"card-1": {"id": "card-1", "title": "Existing", "details": "Notes."}},
}


def _mock_call_openrouter(monkeypatch, content: str) -> dict:
    captured: dict = {}

    async def fake_call_openrouter(messages, response_format=None):
        captured["messages"] = messages
        captured["response_format"] = response_format
        return content

    monkeypatch.setattr(ai, "call_openrouter", fake_call_openrouter)
    return captured


def test_ask_about_board_sends_board_history_and_message(monkeypatch):
    captured = _mock_call_openrouter(
        monkeypatch, '{"reply": "Sure thing", "board_update": null}'
    )
    history = [
        {"role": "user", "content": "hi"},
        {"role": "assistant", "content": "hello"},
    ]

    result = asyncio.run(
        ask_about_board(SAMPLE_BOARD, "What's on the board?", history)
    )

    assert result.reply == "Sure thing"
    assert result.board_update is None

    messages = captured["messages"]
    assert messages[0]["role"] == "system"
    assert "card-1" in messages[1]["content"]
    assert messages[2:4] == history
    assert messages[-1] == {"role": "user", "content": "What's on the board?"}
    assert captured["response_format"]["type"] == "json_schema"


def test_ask_about_board_returns_valid_board_update(monkeypatch):
    updated_board = {
        "columns": [{"id": "col-a", "title": "A", "cardIds": ["card-1", "card-2"]}],
        "cards": {
            "card-1": {"id": "card-1", "title": "Existing", "details": "Notes."},
            "card-2": {"id": "card-2", "title": "New card", "details": "Added by AI"},
        },
    }
    content = json.dumps({"reply": "Added a card", "board_update": updated_board})
    _mock_call_openrouter(monkeypatch, content)

    result = asyncio.run(ask_about_board(SAMPLE_BOARD, "Add a card", []))

    assert result.reply == "Added a card"
    assert isinstance(result.board_update, BoardData)
    assert result.board_update.cards["card-2"].title == "New card"


def test_ask_about_board_drops_unsafe_board_update(monkeypatch):
    unsafe_board = {
        "columns": [
            {"id": "col-a", "title": "A", "cardIds": ["card-1", "missing-card"]}
        ],
        "cards": {"card-1": {"id": "card-1", "title": "Existing", "details": "Notes."}},
    }
    content = json.dumps({"reply": "Done", "board_update": unsafe_board})
    _mock_call_openrouter(monkeypatch, content)

    result = asyncio.run(ask_about_board(SAMPLE_BOARD, "Do something", []))

    assert result.reply == "Done"
    assert result.board_update is None


def test_ask_about_board_raises_on_invalid_json(monkeypatch):
    _mock_call_openrouter(monkeypatch, "not json")

    with pytest.raises(AIConnectionError):
        asyncio.run(ask_about_board(SAMPLE_BOARD, "hi", []))


def test_ask_about_board_raises_when_reply_missing(monkeypatch):
    _mock_call_openrouter(monkeypatch, '{"board_update": null}')

    with pytest.raises(AIConnectionError):
        asyncio.run(ask_about_board(SAMPLE_BOARD, "hi", []))
