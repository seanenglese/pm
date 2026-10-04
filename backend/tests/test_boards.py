import json

import pytest

from app import db
from app.db import BLANK_BOARD, DEFAULT_BOARD

SIMPLE_BOARD = {
    "columns": [{"id": "col-backlog", "title": "Backlog", "cardIds": ["card-1"]}],
    "cards": {
        "card-1": {
            "id": "card-1",
            "title": "Launch plan",
            "details": "Finalize the release checklist.",
            "priority": "medium",
            "dueDate": "2026-12-01",
            "labels": ["release"],
        }
    },
}


def test_boards_require_authentication(client) -> None:
    assert client.get("/api/boards").status_code == 401
    assert client.post("/api/boards", json={"name": "x"}).status_code == 401
    assert client.get("/api/boards/1").status_code == 401
    assert client.put("/api/boards/1", json=SIMPLE_BOARD).status_code == 401
    assert client.delete("/api/boards/1").status_code == 401


def test_starter_board_has_the_sample_data(client, headers, board_id) -> None:
    response = client.get(f"/api/boards/{board_id}", headers=headers)

    assert response.status_code == 200
    body = response.json()
    assert body["name"] == "My first board"
    assert body["board"] == DEFAULT_BOARD
    assert body["createdAt"] and body["updatedAt"]


def test_create_board_starts_blank(client, headers) -> None:
    response = client.post("/api/boards", headers=headers, json={"name": "  Launch  "})

    assert response.status_code == 201
    body = response.json()
    assert body["name"] == "Launch"
    assert body["board"] == BLANK_BOARD

    names = [board["name"] for board in client.get("/api/boards", headers=headers).json()]
    assert names == ["My first board", "Launch"]


@pytest.mark.parametrize("name", ["", "x" * 81])
def test_create_board_validates_name(client, headers, name) -> None:
    response = client.post("/api/boards", headers=headers, json={"name": name})

    assert response.status_code == 422


def test_blank_name_after_trimming_becomes_untitled(client, headers) -> None:
    response = client.post("/api/boards", headers=headers, json={"name": "   "})

    assert response.json()["name"] == "Untitled"


def test_board_can_be_saved_and_read_back(client, headers, board_id) -> None:
    response = client.put(f"/api/boards/{board_id}", headers=headers, json=SIMPLE_BOARD)

    assert response.status_code == 200
    assert response.json()["board"] == SIMPLE_BOARD

    follow_up = client.get(f"/api/boards/{board_id}", headers=headers)
    assert follow_up.json()["board"] == SIMPLE_BOARD


def test_board_survives_multiple_consecutive_updates(client, headers, board_id) -> None:
    for pass_number in range(1, 4):
        board = {
            "columns": [{"id": "col-a", "title": "A", "cardIds": ["card-1"]}],
            "cards": {
                "card-1": {"id": "card-1", "title": f"Pass {pass_number}", "details": ""}
            },
        }
        client.put(f"/api/boards/{board_id}", headers=headers, json=board)

    follow_up = client.get(f"/api/boards/{board_id}", headers=headers)
    assert follow_up.json()["board"]["cards"]["card-1"]["title"] == "Pass 3"


def test_boards_of_one_user_are_independent(client, headers, board_id) -> None:
    second_id = client.post("/api/boards", headers=headers, json={"name": "Two"}).json()["id"]

    client.put(f"/api/boards/{board_id}", headers=headers, json=SIMPLE_BOARD)

    second = client.get(f"/api/boards/{second_id}", headers=headers).json()
    assert second["board"] == BLANK_BOARD


def test_rename_board(client, headers, board_id) -> None:
    response = client.patch(
        f"/api/boards/{board_id}", headers=headers, json={"name": "Roadmap"}
    )

    assert response.status_code == 200
    assert response.json()["name"] == "Roadmap"
    assert client.get("/api/boards", headers=headers).json()[0]["name"] == "Roadmap"


def test_delete_board(client, headers, board_id) -> None:
    response = client.delete(f"/api/boards/{board_id}", headers=headers)

    assert response.status_code == 204
    assert client.get("/api/boards", headers=headers).json() == []
    assert client.get(f"/api/boards/{board_id}", headers=headers).status_code == 404


def test_missing_board_returns_404(client, headers) -> None:
    assert client.get("/api/boards/9999", headers=headers).status_code == 404
    assert client.put("/api/boards/9999", headers=headers, json=SIMPLE_BOARD).status_code == 404
    assert client.patch("/api/boards/9999", headers=headers, json={"name": "x"}).status_code == 404
    assert client.delete("/api/boards/9999", headers=headers).status_code == 404


def test_users_cannot_touch_each_others_boards(client, register, headers, board_id) -> None:
    intruder, _ = register()
    url = f"/api/boards/{board_id}"

    assert client.get(url, headers=intruder).status_code == 404
    assert client.put(url, headers=intruder, json=SIMPLE_BOARD).status_code == 404
    assert client.patch(url, headers=intruder, json={"name": "Mine"}).status_code == 404
    assert client.delete(url, headers=intruder).status_code == 404
    assert client.post(f"{url}/chat", headers=intruder, json={"message": "hi"}).status_code == 404

    owner_view = client.get(url, headers=headers).json()
    assert owner_view["name"] == "My first board"
    assert owner_view["board"] == DEFAULT_BOARD
    assert len(client.get("/api/boards", headers=intruder).json()) == 1


def test_board_update_rejects_invalid_payload(client, headers, board_id) -> None:
    response = client.put(
        f"/api/boards/{board_id}",
        headers=headers,
        json={"columns": [{"id": "col-a", "title": "A"}], "cards": {}},
    )

    assert response.status_code == 422


CARD_K = {"id": "card-k", "title": "K", "details": "d"}


@pytest.mark.parametrize(
    "board",
    [
        pytest.param(
            {
                "columns": [{"id": "col-a", "title": "A", "cardIds": ["missing"]}],
                "cards": {},
            },
            id="unknown-card-id",
        ),
        pytest.param(
            {
                "columns": [
                    {"id": "col-a", "title": "A", "cardIds": ["card-k"]},
                    {"id": "col-b", "title": "B", "cardIds": ["card-k"]},
                ],
                "cards": {"card-k": CARD_K},
            },
            id="card-in-two-columns",
        ),
        pytest.param(
            {
                "columns": [{"id": "col-a", "title": "A", "cardIds": ["card-k", "card-k"]}],
                "cards": {"card-k": CARD_K},
            },
            id="card-twice-in-one-column",
        ),
        pytest.param(
            {
                "columns": [{"id": "col-a", "title": "A", "cardIds": ["other-key"]}],
                "cards": {"other-key": CARD_K},
            },
            id="card-key-mismatch",
        ),
        pytest.param(
            {
                "columns": [
                    {"id": "col-a", "title": "A", "cardIds": []},
                    {"id": "col-a", "title": "A2", "cardIds": []},
                ],
                "cards": {},
            },
            id="duplicate-column-id",
        ),
    ],
)
def test_board_update_rejects_inconsistent_board(client, headers, board_id, board) -> None:
    response = client.put(f"/api/boards/{board_id}", headers=headers, json=board)

    assert response.status_code == 422


def _board_with_card(**fields) -> dict:
    card = {"id": "card-1", "title": "Plan", "details": "", **fields}
    return {
        "columns": [{"id": "col-a", "title": "A", "cardIds": ["card-1"]}],
        "cards": {"card-1": card},
    }


def test_card_priority_due_date_and_labels_round_trip(client, headers, board_id) -> None:
    board = _board_with_card(priority="high", dueDate="2026-11-05", labels=[" design ", "qa"])

    saved = client.put(f"/api/boards/{board_id}", headers=headers, json=board)

    assert saved.status_code == 200
    card = client.get(f"/api/boards/{board_id}", headers=headers).json()["board"]["cards"]["card-1"]
    assert card == {
        "id": "card-1",
        "title": "Plan",
        "details": "",
        "priority": "high",
        "dueDate": "2026-11-05",
        "labels": ["design", "qa"],
    }


def test_cards_saved_before_the_new_fields_existed_get_defaults(client, headers, board_id) -> None:
    legacy = {
        "columns": [{"id": "col-a", "title": "A", "cardIds": ["card-1"]}],
        "cards": {"card-1": {"id": "card-1", "title": "Old", "details": "Saved long ago"}},
    }
    with db.db_connection() as connection:
        connection.execute(
            "UPDATE boards SET board_json = ? WHERE id = ?", (json.dumps(legacy), board_id)
        )

    card = client.get(f"/api/boards/{board_id}", headers=headers).json()["board"]["cards"]["card-1"]

    assert card["priority"] is None
    assert card["dueDate"] is None
    assert card["labels"] == []


@pytest.mark.parametrize(
    "fields",
    [
        pytest.param({"priority": "urgent"}, id="unknown-priority"),
        pytest.param({"dueDate": "2026-13-01"}, id="impossible-date"),
        pytest.param({"dueDate": "next week"}, id="non-date"),
        pytest.param({"labels": [""]}, id="empty-label"),
        pytest.param({"labels": ["   "]}, id="blank-label"),
        pytest.param({"labels": ["x" * 31]}, id="long-label"),
        pytest.param({"labels": [f"l{i}" for i in range(11)]}, id="too-many-labels"),
    ],
)
def test_card_fields_are_validated(client, headers, board_id, fields) -> None:
    response = client.put(
        f"/api/boards/{board_id}", headers=headers, json=_board_with_card(**fields)
    )

    assert response.status_code == 422
