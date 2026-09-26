import json
import os

import httpx
from pydantic import BaseModel, ConfigDict

from app.models import BoardData

OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"
OPENROUTER_MODEL = "nvidia/nemotron-3-super-120b-a12b:free"

SYSTEM_PROMPT = (
    "You are an assistant embedded in a Kanban board app. You are given the "
    "current board as JSON: `columns` is an ordered list of "
    "{id, title, cardIds}, and `cards` is a map of card id to "
    "{id, title, details}. Always write a short answer to the user's message "
    "in `reply`. If the user asks you to create, edit, move, or remove one or "
    "more cards, set `board_update` to the complete new board JSON with your "
    "changes applied, keeping every existing column and card you were not "
    "asked to change. If no board change is needed, set `board_update` to "
    "null."
)


class AIConnectionError(Exception):
    pass


class AIBoardResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    reply: str
    board_update: BoardData | None


async def call_openrouter(
    messages: list[dict], response_format: dict | None = None
) -> str:
    api_key = os.environ.get("OPENROUTER_API_KEY")
    if not api_key:
        raise AIConnectionError("OPENROUTER_API_KEY is not configured")

    payload: dict = {"model": OPENROUTER_MODEL, "messages": messages}
    if response_format is not None:
        payload["response_format"] = response_format

    async with httpx.AsyncClient(timeout=30) as client:
        try:
            response = await client.post(
                OPENROUTER_URL,
                headers={"Authorization": f"Bearer {api_key}"},
                json=payload,
            )
        except httpx.HTTPError as error:
            raise AIConnectionError(f"OpenRouter request failed: {error}") from error

    if response.status_code != 200:
        raise AIConnectionError(
            f"OpenRouter request failed: {response.status_code} {response.text}"
        )

    data = response.json()
    return data["choices"][0]["message"]["content"]


async def ask_about_board(
    board: dict, message: str, history: list[dict]
) -> AIBoardResponse:
    messages = [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "system", "content": f"Current board JSON:\n{json.dumps(board)}"},
        *history,
        {"role": "user", "content": message},
    ]

    response_format = {
        "type": "json_schema",
        "json_schema": {
            "name": "ai_board_response",
            "strict": True,
            "schema": AIBoardResponse.model_json_schema(),
        },
    }

    content = await call_openrouter(messages, response_format=response_format)

    try:
        raw = json.loads(content)
    except json.JSONDecodeError as error:
        raise AIConnectionError(f"AI returned invalid JSON: {error}") from error

    reply = raw.get("reply")
    if not isinstance(reply, str):
        raise AIConnectionError("AI response is missing a text reply")

    board_update = None
    raw_update = raw.get("board_update")
    if raw_update is not None:
        try:
            board_update = BoardData.model_validate(raw_update)
        except ValueError:
            board_update = None

    return AIBoardResponse(reply=reply, board_update=board_update)
