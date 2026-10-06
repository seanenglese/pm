# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

A project management app: user accounts, any number of Kanban boards per user, a Next.js frontend, a FastAPI backend, SQLite persistence, and an AI chat sidebar (via OpenRouter) that can answer questions about the open board and edit it. The original 10-part MVP is complete; Phase 2 is growing it in iterations — `docs/PLAN.md` has the roadmap and per-iteration log (check it for the next unfinished iteration and update it as you go). Full requirements and technical decisions live in `AGENTS.md` (root) — read it before making architectural choices.

Directory-level `AGENTS.md` files exist in `backend/`, `frontend/`, and `scripts/` — read the one for the area you're touching.

## Architecture

- **Runtime model**: the Next.js frontend is built as a static export (`output: "export"` in `frontend/next.config.ts`) and the Dockerfile copies the output into `backend/app/static/` inside the image (that directory is gitignored, not committed). FastAPI serves that static build at `/` and exposes JSON APIs under `/api/*` from the same process/port (8000). There is no separate frontend dev server in production — Docker is the canonical way to run the full stack (see `docker-compose.yml` / `Dockerfile`). Compose mounts only `backend/data/` from the host, so frontend changes need `docker compose up --build` to show up. To serve the UI from a bare `uvicorn` run, copy `frontend/out/*` into `backend/app/static/` yourself; without it the API still works and `/` returns an error.
- **Backend** (`backend/app/`): a FastAPI app in a few modules.
  - `db.py` — SQLite at `backend/data/pm_mvp.db` (gitignored; the only host directory mounted into the container, so it survives rebuilds), created on startup (`init_db()`) with `users`, `sessions`, and `boards` tables. Schema version lives in `PRAGMA user_version`; a pre-accounts (version 0) database is migrated in place. Also holds the seed boards and `create_board`.
  - `auth.py` — `/api/auth/*`: register, login, logout, me (GET; DELETE with the password deletes the account, cascading to boards and sessions), change password. scrypt password hashes; random bearer tokens stored only as SHA-256 hashes, 30-day expiry. `CurrentUser` is the dependency every protected route uses. `ensure_demo_user()` (run on startup) keeps the `user` / `password` demo account working.
  - `boards.py` — `/api/boards` (list, create) and `/api/boards/{id}` (get, PUT board, PATCH name, DELETE, POST `/chat`). Every query is scoped to the signed-in user; another user's board answers 404.
  - `main.py` — app wiring: lifespan (init db + demo user), routers, `/api/health`, `/api/ai/health`, static files.
  - Each board is a single JSON blob (`boards.board_json`), not normalized into card/column tables — this intentionally mirrors the frontend's in-memory data shape (see `docs/database-approach.md`).
  - `DEFAULT_BOARD` in `db.py` (a new account's first board) and `initialData` in `frontend/src/lib/kanban.ts` are two independent copies of the same seed data (the frontend's copy is only a Vitest fixture); keep them in sync if one changes. Boards a user creates start from `BLANK_BOARD`.
  - `app/models.py` holds the shared `Card`/`Column`/`BoardData` pydantic models. `Card` is `id`, `title`, `details`, plus `priority`, `dueDate` (a `date`), and `labels`, which have defaults so older stored boards still validate; board reads go through `BoardData` (`boards.py::_board`) so the API always returns every field, and writes use `model_dump(mode="json")` because of the date. The models are all `extra="forbid"`, plus a `BoardData` validator that rejects a column referencing a card id not present in `cards`, a card id appearing more than once across columns, duplicate column ids, and a `cards` key that doesn't match its card's `id`) used by both the board CRUD endpoints and the chat endpoint.
- **Frontend** (`frontend/src`):
  - `src/app/page.tsx` — top-level page; restores the session from the token in `localStorage` (`getMe`), shows `AuthForm` when signed out and `Workspace` when signed in, and drops back to sign-in when any API call gets a 401 (the `UNAUTHORIZED_EVENT` window event from `api.ts`).
  - `src/components/` — `AuthForm` (sign in / create account), `Workspace` (app bar with Account and Log out, board tabs, create/rename/delete board; remembers the last open board), `KanbanBoard` (one board: owns board + chat state and the assistant show/hide toggle, keyed by board id so switching boards resets it; adds, moves, and deletes columns), `KanbanColumn` (header has move-left/right and delete), `KanbanCard` (also exports `CardMeta`: priority/due/label badges), `CardEditor` (modal for editing a card), `AccountSettings` (modal: change password, delete account), `Modal` (the shared dialog shell `CardEditor` and `AccountSettings` use: backdrop, Escape/outside-click to close, shared field classes), `FilterBar` (search and priority/label/due filters; the filter state lives in `KanbanBoard` and columns receive only the matching cards), `KanbanCardPreview`, `NewCardForm` (drag-and-drop via `@dnd-kit`), and `ChatSidebar` (the AI chat UI).
  - `src/lib/kanban.ts` — pure data-model functions (`moveCard`, `moveColumn`, `removeColumn`, `createId`, `parseLabels`, `todayIso`, `dueStatus`, `formatDueDate`, and the filter helpers `cardMatches` / `hasFilters` / `boardLabels`) and the `BoardData`/`Column`/`Card`/`Priority`/`CardFilters` types shared across components.
  - `src/lib/api.ts` — the API client. One `request()` helper adds the bearer token, parses errors into `ApiError` (with the server's `detail` text and status), and on a 401 clears the token and fires `UNAUTHORIZED_EVENT`. Exposes auth calls (`login`, `register`, `logout`, `getMe`, `changePassword`, `deleteAccount`) and board calls (`listBoards`, `createBoard`, `fetchBoard`, `saveBoard`, `renameBoard`, `deleteBoard`, `sendChatMessage`). Relative URLs only resolve when frontend and backend share an origin (Docker, or the static export served by FastAPI) — see "Running against the backend" in `frontend/AGENTS.md`.
  - `src/test/fakeApi.ts` — an in-memory fake of the whole backend API (same URLs, status codes, and payloads) that component tests install as `fetch`; extend it alongside any new endpoint.
- **AI integration**: `backend/app/ai.py` has `call_openrouter()`, which posts to OpenRouter's chat completions endpoint using `OPENROUTER_API_KEY` from the root `.env` (loaded via `env_file` in `docker-compose.yml`). Model is `nvidia/nemotron-3-super-120b-a12b:free` — chosen because `z-ai/glm-5.2:free` (the originally planned model per AGENTS.md) was discontinued as a free tier on OpenRouter; the replacement also supports structured outputs. `GET /api/ai/health` proves connectivity with a trivial prompt.
  - `POST /api/boards/{id}/chat` (`app/ai.py::ask_about_board`) sends the current board JSON, prior history, and the new message to the model in one call, enforcing an OpenRouter structured-output schema (`AIBoardResponse`: `reply: str`, `board_update: BoardData | None`). A `board_update` is only persisted if it passes `BoardData` validation — otherwise it's silently dropped and only the text `reply` is returned.
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
uv run pytest --cov=app --cov-report=term-missing  # with coverage
uv run pytest tests/test_boards.py::test_rename_board  # single test
```

Without a local `uv` (or with only an old host Python), run the same commands in a container:
`docker run --rm -v "<repo>/backend:/src" -w /src -e UV_PROJECT_ENVIRONMENT=/venv ghcr.io/astral-sh/uv:python3.12-bookworm-slim uv run --locked pytest`.
Tests get an isolated temp database plus `client`, `register`, `headers` (a fresh signed-in account), and `board_id` (its starter board) fixtures from `tests/conftest.py`.

### Frontend (`frontend/`)

```
npm install
npm run dev          # Next dev server
npm run build         # static export build (writes to frontend/out)
npm run lint
npm test              # == npm run test:unit — vitest run (unit tests, jsdom)
npm run test:unit:watch
npx vitest run --coverage
npm run test:e2e      # Playwright against the real app: builds the Docker image and runs it on :8011 with a throwaway DB
npm run test:all      # unit then e2e
```

Vitest only picks up `src/**/*.{test,spec}.{ts,tsx}` (colocated with source, e.g. `KanbanBoard.test.tsx`, `kanban.test.ts`); Playwright specs live separately in `frontend/tests/`. The e2e suite is an integration test of the whole stack (`tests/global-setup.ts` builds and starts the container, and removes it afterwards); set `E2E_BASE_URL` to run it against an already-running server instead. Each e2e test registers its own account, so tests never share state. The container has no `OPENROUTER_API_KEY`, so tests that need a model reply intercept the chat route in the browser.

## Conventions (from AGENTS.md)

- Keep it simple — no over-engineering, no unnecessary defensive programming, no speculative features.
- Use current library versions and idiomatic patterns.
- No emojis, anywhere.
- When debugging, find the root cause before applying a fix — don't guess-and-check.
- Brand colors (already wired into the frontend via CSS vars): accent yellow `#ecad0a`, blue primary `#209dd7`, purple secondary `#753991`, dark navy `#032147`, gray text `#888888`.
