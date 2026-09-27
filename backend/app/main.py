import json
import sqlite3
from contextlib import asynccontextmanager, contextmanager
from pathlib import Path
from typing import Literal

from fastapi import FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, ConfigDict

from app.ai import AIConnectionError, ask_about_board, call_openrouter
from app.models import BoardData

@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    yield


app = FastAPI(title="PM MVP Backend", lifespan=lifespan)
STATIC_DIR = Path(__file__).resolve().parent / "static"
DB_PATH = Path(__file__).resolve().parent.parent / "data" / "pm_mvp.db"


class ChatMessage(BaseModel):
    model_config = ConfigDict(extra="forbid")

    role: Literal["user", "assistant"]
    content: str


class ChatRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    message: str
    history: list[ChatMessage] = []


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
        },
        "card-2": {
            "id": "card-2",
            "title": "Gather customer signals",
            "details": "Review support tags, sales notes, and churn feedback.",
        },
        "card-3": {
            "id": "card-3",
            "title": "Prototype analytics view",
            "details": "Sketch initial dashboard layout and key drill-downs.",
        },
        "card-4": {
            "id": "card-4",
            "title": "Refine status language",
            "details": "Standardize column labels and tone across the board.",
        },
        "card-5": {
            "id": "card-5",
            "title": "Design card layout",
            "details": "Add hierarchy and spacing for scanning dense lists.",
        },
        "card-6": {
            "id": "card-6",
            "title": "QA micro-interactions",
            "details": "Verify hover, focus, and loading states.",
        },
        "card-7": {
            "id": "card-7",
            "title": "Ship marketing page",
            "details": "Final copy approved and asset pack delivered.",
        },
        "card-8": {
            "id": "card-8",
            "title": "Close onboarding sprint",
            "details": "Document release notes and share internally.",
        },
    },
}


@contextmanager
def db_connection():
    connection = sqlite3.connect(DB_PATH)
    connection.row_factory = sqlite3.Row
    try:
        yield connection
        connection.commit()
    finally:
        connection.close()


def init_db() -> None:
    DB_PATH.parent.mkdir(exist_ok=True)
    with db_connection() as connection:
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT NOT NULL UNIQUE,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
            """
        )
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS boards (
                user_id INTEGER PRIMARY KEY,
                board_json TEXT NOT NULL,
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY(user_id) REFERENCES users(id)
            )
            """
        )


def get_or_create_user_id(connection: sqlite3.Connection, username: str) -> int:
    connection.execute(
        "INSERT OR IGNORE INTO users (username) VALUES (?)",
        (username,),
    )
    row = connection.execute(
        "SELECT id FROM users WHERE username = ?",
        (username,),
    ).fetchone()
    return row["id"]


def get_board_for_user(username: str) -> dict:
    with db_connection() as connection:
        user_id = get_or_create_user_id(connection, username)
        board_row = connection.execute(
            "SELECT board_json FROM boards WHERE user_id = ?",
            (user_id,),
        ).fetchone()
        if board_row is None:
            connection.execute(
                "INSERT INTO boards (user_id, board_json) VALUES (?, ?)",
                (user_id, json.dumps(DEFAULT_BOARD)),
            )
            return DEFAULT_BOARD

        return json.loads(board_row["board_json"])


def save_board_for_user(username: str, board: dict) -> dict:
    with db_connection() as connection:
        user_id = get_or_create_user_id(connection, username)
        connection.execute(
            """
            INSERT INTO boards (user_id, board_json)
            VALUES (?, ?)
            ON CONFLICT(user_id) DO UPDATE SET board_json = excluded.board_json,
            updated_at = CURRENT_TIMESTAMP
            """,
            (user_id, json.dumps(board)),
        )
        return board


@app.get("/api/health")
def health_check() -> dict[str, str]:
    return {"status": "ok", "service": "pm-mvp"}


@app.get("/api/ai/health")
async def ai_health() -> dict[str, str]:
    try:
        reply = await call_openrouter(
            [{"role": "user", "content": "What is 2 + 2? Reply with only the digit."}]
        )
    except AIConnectionError as error:
        raise HTTPException(status_code=502, detail=str(error)) from error

    return {"status": "ok", "reply": reply}


@app.get("/api/users/{username}/board")
def get_user_board(username: str) -> dict:
    board = get_board_for_user(username)
    return {"username": username, "board": board}


@app.put("/api/users/{username}/board")
def update_user_board(username: str, payload: BoardData) -> dict:
    saved = save_board_for_user(username, payload.model_dump())
    return {"username": username, "board": saved}


@app.post("/api/users/{username}/chat")
async def chat_with_ai(username: str, payload: ChatRequest) -> dict:
    board = get_board_for_user(username)

    try:
        ai_response = await ask_about_board(
            board,
            payload.message,
            [message.model_dump() for message in payload.history],
        )
    except AIConnectionError as error:
        raise HTTPException(status_code=502, detail=str(error)) from error

    if ai_response.board_update is not None:
        board = save_board_for_user(username, ai_response.board_update.model_dump())

    return {"reply": ai_response.reply, "board": board}


# check_dir=False: the static export only exists after a frontend build (always true in Docker).
app.mount("/", StaticFiles(directory=STATIC_DIR, html=True, check_dir=False), name="static")
