# High level steps for project

## Current status

All 10 planned parts are complete. The working app is a local Dockerized FastAPI + Next.js project: a static frontend served at `/` by FastAPI, a dummy username/password gateway, a SQLite-backed Kanban board that the frontend reads and writes through the backend API, and an AI chat sidebar that answers questions about the board and can propose validated board edits via OpenRouter — applied and reflected in the UI automatically, no manual refresh needed. Verified end-to-end against the real backend, real SQLite persistence, and the real OpenRouter API (see Part 10 below), not just against mocks.

### Completed work

- Part 1: Plan - complete
- Part 2: Scaffolding - complete
  - Docker setup created
  - FastAPI backend bootstrapped
  - start/stop scripts created
  - app serves a static frontend shell at `/`
- Part 3: Add in Frontend - complete
  - Next.js frontend built and served as static output
  - Kanban board UI rendered at `/`
  - frontend unit tests pass
- Part 4: Add in a fake user sign in experience - complete
  - login gate added with dummy credentials `user` / `password`
  - logout flow resets the app back to sign-in state
  - auth tests pass
- Part 5: Database modeling - complete
  - SQLite schema proposal saved to `docs/database-schema.json`
  - design notes saved to `docs/database-approach.md`
- Part 6: Backend - complete
  - user-scoped board APIs added
  - SQLite database auto-created if missing
  - default board seeded for a user
  - backend contract tests added and passing
  - PUT board payload validated against a Pydantic schema instead of an untyped dict
  - SQLite connections are explicitly closed after each request (previously leaked)
  - dead code removed (`upsert_default_board`, unused `JSONResponse` import) and duplicated user-lookup logic consolidated
  - tests run against an isolated temp SQLite file instead of mutating the real dev database
  - added edge-case tests: idempotent board creation, repeated updates, per-user isolation, invalid payload rejection
- Part 7: Frontend + Backend - complete
  - `frontend/src/lib/api.ts` added as the board API client (`fetchBoard`, `saveBoard`) calling `/api/users/{username}/board`
  - `KanbanBoard` now loads the signed-in user's board on mount (with loading/error/retry states) and persists every rename, add, delete, and drag-and-drop move through the API instead of keeping board state only in memory
  - `page.tsx` passes the signed-in username into `KanbanBoard` so board reads/writes are user-scoped
  - unit tests cover load, save-on-edit, and reload-reflects-last-save behavior with a mocked API; e2e tests mock the same contract via Playwright route interception and add a reload-persistence check
- Part 8: AI connectivity - complete
  - `backend/app/ai.py` added: `call_openrouter()` posts to OpenRouter's chat completions endpoint using `OPENROUTER_API_KEY` from the environment
  - `GET /api/ai/health` sends a "what is 2 + 2" prompt through OpenRouter and returns the model's reply, or a 502 with details if the call fails
  - the model originally specified (`z-ai/glm-5.2:free`) has been discontinued as a free tier on OpenRouter; switched to `nvidia/nemotron-3-super-120b-a12b:free`, which is currently free and also supports structured outputs (needed for Part 9) — confirmed with the user before making the change since it affects AGENTS.md's stated technical decision
  - verified live end-to-end against the real OPENROUTER_API_KEY in `.env`: `GET /api/ai/health` returned `{"status": "ok", "reply": "4"}`
  - unit tests mock the HTTP layer (no live network calls in the automated suite) covering success, missing API key, non-200 responses, and network errors, plus endpoint-level tests for the 200/502 paths
- Part 9: AI board reasoning - complete
  - `POST /api/users/{username}/chat` sends the current board JSON, prior conversation history, and the new user message to the model in one call (`app/ai.py::ask_about_board`)
  - the model is required to answer via OpenRouter structured outputs (`response_format: json_schema`, `strict: true`) against a schema derived from `AIBoardResponse` (`reply: str`, `board_update: BoardData | None`)
  - `BoardData` (moved to `app/models.py`, shared by the board and chat endpoints) rejects unknown fields and any column that references a card id not present in `cards`; a `board_update` that fails this check is dropped (the reply is still returned) instead of corrupting the persisted board
  - client-supplied history is restricted to `user`/`assistant` roles (422 on anything else), so a caller cannot inject a fake system message into the prompt
  - verified live end-to-end: asked the AI to add a card by name, got back a valid `board_update` that was persisted and reflected in a follow-up `GET`, and confirmed a read-only question against a fresh board does not trigger a spurious update
  - unit tests cover: board/history/message are correctly assembled into the request, a valid update is applied, an update with a dangling card reference is safely dropped, invalid/incomplete JSON from the model raises a 502, and endpoint tests cover persistence, history round-tripping, and role rejection
- Part 10: AI sidebar and automatic refresh - complete
  - `frontend/src/components/ChatSidebar.tsx` (new) renders the conversation and a message form; `KanbanBoard` owns the chat history/loading/error state and renders the sidebar alongside the board columns
  - `frontend/src/lib/api.ts::sendChatMessage` posts `{message, history}` to `POST /api/users/{username}/chat` and returns `{reply, board}`
  - sending a message optimistically shows the user's message immediately; on response, the assistant's reply is appended to the chat and `setBoard(updatedBoard)` replaces the board state directly from the response — no extra fetch or manual refresh needed, since the backend already persisted the update before responding
  - a failed chat call shows an inline error in the sidebar without disturbing the board or chat history already shown
  - unit tests cover the sidebar in isolation (empty state, trimming/clearing input, disabled-while-loading, error display) and integration with `KanbanBoard` (reply displayed, a returned `board_update` is reflected in the UI immediately, error path); e2e test mocks the chat route and confirms the same; **also verified against the real stack**: built the actual Docker image, ran it with the real `.env`, and drove the real browser UI with Playwright (no mocks) against the live backend and live OpenRouter — logged in, asked the assistant to add a specific card, watched it appear in the right column without a page refresh, then reloaded the page and confirmed it was persisted in SQLite

### Key design decisions

- Docker is the canonical local runtime for the app, with the Python service exposed on port 8000. The frontend is built inside the image (not committed), and only `backend/data/` (the SQLite file) is mounted from the host.
- The frontend is served from the FastAPI backend root route, matching the production architecture and the project requirement that `/` shows the app.
- The minimal MVP uses SQLite rather than a separate database service, with a `users` table and a `boards` table.
- The board data model remains a JSON payload with `columns` and `cards`, matching the existing frontend state shape and avoiding premature over-normalization.
- The sign-in flow is intentionally a dummy authentication flow for the MVP, while the database model is built to support multi-user expansion later.
- The app keeps the board saved per user, with a default seeded board if the user has no existing board.

## Post-MVP fixes

- Stale frontend under `docker compose` (fixed 2026-09-26): `docker-compose.yml` bind-mounted all of `./backend` into the container, which hid the frontend the Dockerfile builds and served a stale static export committed to `backend/app/static` from before Part 4 (no sign-in, no API calls, no chat). The Part 10 end-to-end check ran the image directly, without compose, so it did not catch this. Fix:
  - the SQLite database moved from `backend/app/pm_mvp.db` to `backend/data/pm_mvp.db`, and compose now mounts only `./backend/data`, so board data still survives container rebuilds
  - `backend/app/static/` is no longer tracked in git; the Docker image always serves the frontend it just built
  - the static mount uses `check_dir=False` so the backend (and its tests) run without a frontend build present; the root-route test serves a stand-in `index.html`
  - verified with `docker compose up --build`: `/` serves the current UI (sign-in and chat present), `/api/ai/health` returns `4`, and a board saved before `docker compose down` / `up` is still there afterwards

## Success criteria

All met, and verified against the real stack (real Docker build, real SQLite, real OpenRouter), not just mocks:

- [x] The board persists per user in SQLite and survives a refresh.
- [x] The frontend reads and writes board state through the API.
- [x] The AI endpoint responds successfully via OpenRouter.
- [x] The model can both answer questions and optionally modify the board using structured JSON output.
- [x] The chat sidebar updates the board automatically when the model requests a change.

## Phase 2: comprehensive project management app

Goal: grow the MVP into a fuller project management app (real accounts, multiple boards per user, richer cards and boards), with strong unit coverage and integration tests against the real stack. Work proceeds in iterations; each one leaves the app working, tested, and documented.

### Roadmap

- [x] Iteration 1: real accounts and multiple boards
- [x] Iteration 2: card editing and richer cards (edit title/details in place, priority, due date, labels), with the AI schema extended to match
- [x] Iteration 3: column management (add, delete, reorder columns) and a collapsible assistant panel so more columns fit on screen
- [ ] Iteration 4: search and filtering on a board (text, priority, label, due/overdue)
- [ ] Iteration 5: account settings UI (change password, delete account)
- [ ] Later candidates: board sharing with other users, card comments/activity history, a cross-board overview, persisted chat history

### Iteration 1: real accounts and multiple boards (complete)

- Backend split into modules: `app/db.py` (connection, schema, migration, seed boards), `app/auth.py` (password hashing, sessions, `/api/auth/*`), `app/boards.py` (`/api/boards/*` including chat), `app/main.py` (app wiring, health checks, static files)
- Accounts: register, sign in, sign out, current user, change password (signs out other sessions). Passwords are salted scrypt hashes; sessions are random bearer tokens stored only as SHA-256 hashes, expiring after 30 days
- Boards: list, create (blank 4-column layout), read, save, rename, delete, chat; all scoped to the signed-in user (another user's board answers 404, never 403, so ids don't leak)
- The old username-in-URL endpoints (`/api/users/{username}/...`) are gone; nothing is reachable without a session
- Existing databases migrate in place (`PRAGMA user_version`); the demo account `user` / `password` is kept and keeps its board
- Frontend: `AuthForm` (sign in / create account), `Workspace` (app bar, board tabs, new/rename/delete board, remembers the last open board), session restored from `localStorage` on reload, and an expired session returns to sign-in. Columns now scroll horizontally at a fixed width instead of a fixed 5-column grid, so boards can have any number of columns
- Tests: backend 72 tests at 99% line coverage (`pytest --cov=app`); frontend 55 unit tests run against an in-memory fake of the whole API (`src/test/fakeApi.ts`); the 11 Playwright tests now run against the real Docker image (real FastAPI, SQLite, static build) with a throwaway database, so they are true integration tests (`tests/global-setup.ts`)
- Backend tests without a local uv: `docker run --rm -v "<repo>/backend:/src" -w /src -e UV_PROJECT_ENVIRONMENT=/venv ghcr.io/astral-sh/uv:python3.12-bookworm-slim uv run --locked pytest`
- Found while testing: at 1280px wide only three columns fit beside the assistant panel, which is why iteration 3 includes a collapsible panel

### Iteration 2: card editing and richer cards (complete)

- `Card` (`app/models.py`) gains optional `priority` (`low` / `medium` / `high` / null), `dueDate` (a real calendar date, so `2026-13-01` is rejected), and `labels` (up to 10, each 1-30 characters after trimming). The fields have defaults, so boards saved before this iteration still validate; reads run the stored JSON through `BoardData`, so the API always returns the full card shape. No schema migration was needed since boards are JSON blobs
- Sample cards in the starter board now have priorities and labels (backend `DEFAULT_BOARD` and frontend `initialData` kept in sync)
- The AI system prompt describes the new fields, and the board context message now starts with today's date so requests like "due next Friday" can be resolved
- Frontend: cards show a priority badge, a due-date badge (overdue in red, due today in yellow), and label chips (`CardMeta`, shared with the drag preview); an **Edit** button on each card opens `CardEditor`, a modal dialog for title, details, priority, due date, and comma-separated labels (Escape, Cancel, or clicking outside closes it without saving)
- Pure helpers in `lib/kanban.ts`: `parseLabels`, `todayIso`, `dueStatus`, `formatDueDate`
- Tests: backend 83 (99% coverage), frontend 78 unit tests (97% line coverage), plus an e2e test that edits a card on the real stack and checks it after a reload
- Vitest `testTimeout` raised to 15s: interaction-heavy tests that take about 1.5s alone went past the 5s default when all files ran in parallel

### Iteration 3: column management and a collapsible assistant (complete)

- Frontend only: columns already lived in the board JSON, so the backend needed no change beyond telling the assistant it may change columns too
- **Add column** (after the last column) creates "New column", renamed in place; each column header has move-left / move-right buttons (disabled at the ends) and **Delete**, which asks for confirmation only when the column holds cards and removes those cards with it
- Pure helpers `moveColumn` and `removeColumn` in `lib/kanban.ts`; reordering uses buttons rather than drag-and-drop, which keeps it keyboard accessible and out of the way of card dragging
- **Hide assistant** / **Show assistant** in the board header; the choice is remembered in `localStorage` (`pm-assistant`), and the conversation survives hiding the panel. With it hidden, four columns fit at 1280px instead of three
- Tests: frontend 89 unit tests (97% line coverage); e2e adds column add/rename/reorder/delete with a reload, and a check that hiding the assistant brings the fourth column fully into view (14 e2e tests in all). That check compares the column's right edge with its scroll container's, because a column's own box doesn't move when the container clips it, and the columns are taller than the 720px test viewport, so area-based viewport checks can't be used

## Possible future work

- The AI model (`nvidia/nemotron-3-super-120b-a12b:free`) is a free OpenRouter tier and can be slow or occasionally propose an unrequested board change on a multi-turn conversation (observed once during manual testing); the referential-integrity/schema validation in `app/models.py` prevents this from corrupting the board, but does not prevent the model from acting on a request it wasn't given.
- No pagination or trimming of chat history sent to the model; a very long conversation would grow the request size indefinitely.
- No rate limiting on sign-in attempts.
