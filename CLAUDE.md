# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

A Project Management MVP: a Kanban board web app with a Next.js frontend, a FastAPI backend, SQLite persistence, and an AI chat sidebar (via OpenRouter) that can answer questions about the board and edit it. All 10 planned parts are complete and verified end-to-end against the real stack (real Docker build, real SQLite, real OpenRouter) — see `docs/PLAN.md` for the full status and a "Possible future work" list of things intentionally out of scope for this MVP. Full requirements and technical decisions live in `AGENTS.md` (root) — read it before making architectural choices.

Directory-level `AGENTS.md` files exist in `backend/`, `frontend/`, and `scripts/` — read the one for the area you're touching.

## Architecture

- **Runtime model**: the Next.js frontend is built as a static export (`output: "export"` in `frontend/next.config.ts`) and the Dockerfile copies the output into `backend/app/static/` inside the image (that directory is gitignored, not committed). FastAPI serves that static build at `/` and exposes JSON APIs under `/api/*` from the same process/port (8000). There is no separate frontend dev server in production — Docker is the canonical way to run the full stack (see `docker-compose.yml` / `Dockerfile`). Compose mounts only `backend/data/` from the host, so frontend changes need `docker compose up --build` to show up. To serve the UI from a bare `uvicorn` run, copy `frontend/out/*` into `backend/app/static/` yourself; without it the API still works and `/` returns an error.
- **Backend** (`backend/app/main.py`): a single-module FastAPI app.
  - SQLite database at `backend/data/pm_mvp.db` (gitignored; the only host directory mounted into the container, so it survives rebuilds), created automatically on startup (`init_db()`) with `users` and `boards` tables.
  - The board is stored as a single JSON blob per user (`boards.board_json`), not normalized into card/column tables — this intentionally mirrors the frontend's in-memory data shape (see `docs/database-approach.md`).
  - Board endpoints are user-scoped by username in the URL path (`/api/users/{username}/board`), with no real auth — auto-creates a user and seeds `DEFAULT_BOARD` on first access.
  - `DEFAULT_BOARD` in `main.py` and `initialData` in `frontend/src/lib/kanban.ts` are two independent copies of the same seed data (the frontend's copy is now only used as a Vitest test fixture, not runtime state); keep them in sync if one changes.
  - `app/models.py` holds the shared `Card`/`Column`/`BoardData` pydantic models (all `extra="forbid"`, plus a `BoardData` validator that rejects a column referencing a card id not present in `cards`, a card id appearing more than once across columns, duplicate column ids, and a `cards` key that doesn't match its card's `id`) used by both the board CRUD endpoints and the chat endpoint.
- **Frontend** (`frontend/src`):
  - `src/app/page.tsx` — top-level page; currently owns a hardcoded sign-in gate (`user`/`password`) and renders `KanbanBoard` once "authenticated". This is a client-side-only demo gate, not real auth.
  - `src/components/` — `KanbanBoard` (owns board + chat state), `KanbanColumn`, `KanbanCard`, `KanbanCardPreview`, `NewCardForm` (drag-and-drop via `@dnd-kit`), and `ChatSidebar` (the AI chat UI).
  - `src/lib/kanban.ts` — pure data-model functions (`moveCard`, `createId`) and the `BoardData`/`Column`/`Card` types shared across components.
  - `src/lib/api.ts` — the API client: `fetchBoard`/`saveBoard` (`/api/users/{username}/board`) and `sendChatMessage` (`/api/users/{username}/chat`, returns `{reply, board}`). Relative URLs only resolve when frontend and backend share an origin (Docker, or the static export served by FastAPI) — see "Running against the backend" in `frontend/AGENTS.md`.
- **AI integration**: `backend/app/ai.py` has `call_openrouter()`, which posts to OpenRouter's chat completions endpoint using `OPENROUTER_API_KEY` from the root `.env` (loaded via `env_file` in `docker-compose.yml`). Model is `nvidia/nemotron-3-super-120b-a12b:free` — chosen because `z-ai/glm-5.2:free` (the originally planned model per AGENTS.md) was discontinued as a free tier on OpenRouter; the replacement also supports structured outputs. `GET /api/ai/health` proves connectivity with a trivial prompt.
  - `POST /api/users/{username}/chat` (`app/ai.py::ask_about_board`) sends the current board JSON, prior history, and the new message to the model in one call, enforcing an OpenRouter structured-output schema (`AIBoardResponse`: `reply: str`, `board_update: BoardData | None`). A `board_update` is only persisted if it passes `BoardData` validation — otherwise it's silently dropped and only the text `reply` is returned.
  - `ChatSidebar` (frontend) calls this via `sendChatMessage` and `KanbanBoard` applies the returned board directly to its state — the board update is already persisted server-side by the time the response comes back, so no extra fetch or manual refresh is needed on the frontend.
  - Because the model returns a whole board, `KanbanBoard` waits for any in-flight save before sending a chat message and keeps the board read-only (a disabled `<fieldset>` plus no drag sensors) until the reply arrives; otherwise the reply would overwrite edits made in the meantime.
  - Board saves are serialized in `KanbanBoard` (`queueSave`): one PUT at a time, with edits made during a save collapsed into a single follow-up save of the newest board, so saves can't land out of order.

## Commands

### Full stack (Docker)

```
scripts/start.sh    # or start.ps1 / start.bat — docker compose up --build
scripts/stop.sh      # or stop.ps1 / stop.bat   — docker compose down
```

### Backend (`backend/`), using `uv`

```
uv sync                              # install deps from pyproject.toml (backend/.venv is platform-specific; recreate it if it was made in Linux/Docker)
uv run uvicorn app.main:app --reload # run dev server
uv run pytest                        # run all tests
uv run pytest tests/test_health.py::test_user_board_can_be_updated  # single test
```

### Frontend (`frontend/`)

```
npm install
npm run dev          # Next dev server
npm run build         # static export build (writes to frontend/out)
npm run lint
npm test              # == npm run test:unit — vitest run (unit tests, jsdom)
npm run test:unit:watch
npm run test:e2e      # Playwright, boots the dev server itself on :3000
npm run test:all      # unit then e2e
```

Vitest only picks up `src/**/*.{test,spec}.{ts,tsx}` (colocated with source, e.g. `KanbanBoard.test.tsx`, `kanban.test.ts`); Playwright specs live separately in `frontend/tests/`.

## Conventions (from AGENTS.md)

- Keep it simple — no over-engineering, no unnecessary defensive programming, no speculative features.
- Use current library versions and idiomatic patterns.
- No emojis, anywhere.
- When debugging, find the root cause before applying a fix — don't guess-and-check.
- Brand colors (already wired into the frontend via CSS vars): accent yellow `#ecad0a`, blue primary `#209dd7`, purple secondary `#753991`, dark navy `#032147`, gray text `#888888`.
