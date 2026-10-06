import json
import sqlite3
from typing import Literal

from fastapi import APIRouter, HTTPException, Response, status
from pydantic import BaseModel, ConfigDict, Field

from app.ai import AIConnectionError, ask_about_board
from app.auth import CurrentUser
from app.db import create_board, db_connection
from app.models import BoardData

router = APIRouter(prefix="/api/boards", tags=["boards"])


class BoardName(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str = Field(min_length=1, max_length=80)

    def cleaned(self) -> str:
        return self.name.strip() or "Untitled"


class ChatMessage(BaseModel):
    model_config = ConfigDict(extra="forbid")

    role: Literal["user", "assistant"]
    content: str


class ChatRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    message: str
    history: list[ChatMessage] = []


def _summary(row: sqlite3.Row) -> dict:
    return {
        "id": row["id"],
        "name": row["name"],
        "createdAt": row["created_at"],
        "updatedAt": row["updated_at"],
    }


def _owned_board(connection: sqlite3.Connection, board_id: int, user_id: int) -> sqlite3.Row:
    row = connection.execute(
        "SELECT * FROM boards WHERE id = ? AND user_id = ?", (board_id, user_id)
    ).fetchone()
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Board not found")
    return row


def _board(row: sqlite3.Row) -> dict:
    # Validating fills in fields added since the board was saved (e.g. card labels).
    return BoardData.model_validate_json(row["board_json"]).model_dump(mode="json")


def _detail(row: sqlite3.Row) -> dict:
    return {**_summary(row), "board": _board(row)}


def _save(connection: sqlite3.Connection, board_id: int, board: dict) -> sqlite3.Row:
    connection.execute(
        """
        UPDATE boards SET board_json = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
        """,
        (json.dumps(board), board_id),
    )
    return connection.execute("SELECT * FROM boards WHERE id = ?", (board_id,)).fetchone()


@router.get("")
def list_boards(user: CurrentUser) -> list[dict]:
    with db_connection() as connection:
        rows = connection.execute(
            "SELECT * FROM boards WHERE user_id = ? ORDER BY created_at, id",
            (user.id,),
        ).fetchall()
    return [_summary(row) for row in rows]


@router.post("", status_code=status.HTTP_201_CREATED)
def create_user_board(payload: BoardName, user: CurrentUser) -> dict:
    with db_connection() as connection:
        board_id = create_board(connection, user.id, payload.cleaned())
        return _detail(_owned_board(connection, board_id, user.id))


@router.get("/{board_id}")
def get_board(board_id: int, user: CurrentUser) -> dict:
    with db_connection() as connection:
        return _detail(_owned_board(connection, board_id, user.id))


@router.put("/{board_id}")
def save_board(board_id: int, payload: BoardData, user: CurrentUser) -> dict:
    with db_connection() as connection:
        _owned_board(connection, board_id, user.id)
        return _detail(_save(connection, board_id, payload.model_dump(mode="json")))


@router.patch("/{board_id}")
def rename_board(board_id: int, payload: BoardName, user: CurrentUser) -> dict:
    with db_connection() as connection:
        _owned_board(connection, board_id, user.id)
        connection.execute(
            "UPDATE boards SET name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
            (payload.cleaned(), board_id),
        )
        return _summary(_owned_board(connection, board_id, user.id))


@router.delete("/{board_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_board(board_id: int, user: CurrentUser) -> Response:
    with db_connection() as connection:
        _owned_board(connection, board_id, user.id)
        connection.execute("DELETE FROM boards WHERE id = ?", (board_id,))
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/{board_id}/chat")
async def chat_with_ai(board_id: int, payload: ChatRequest, user: CurrentUser) -> dict:
    with db_connection() as connection:
        board = _board(_owned_board(connection, board_id, user.id))

    try:
        ai_response = await ask_about_board(
            board,
            payload.message,
            [message.model_dump() for message in payload.history],
        )
    except AIConnectionError as error:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, str(error)) from error

    if ai_response.board_update is not None:
        board = ai_response.board_update.model_dump(mode="json")
        with db_connection() as connection:
            # The board may have been deleted while the model was thinking.
            _owned_board(connection, board_id, user.id)
            _save(connection, board_id, board)

    return {"reply": ai_response.reply, "board": board}
