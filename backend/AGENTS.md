# Backend

This directory contains the Python FastAPI service that powers the project management app.

## Responsibilities

- Expose the application API for the Kanban board and user session flows
- Serve the built frontend at the root path in production
- Manage persistence through SQLite for the MVP
- Connect to OpenRouter for AI-assisted card and board updates
- Provide health-check endpoints for local Docker validation

## Stack

- Python 3.12+
- FastAPI
- Uvicorn
- SQLite
- uv for dependency management in Docker

## Local development

- Use uv to install dependencies from pyproject.toml
- Run the app with uvicorn app.main:app --reload
- Validate the API with pytest (tests use a temp SQLite file and do not need a frontend build); `pytest --cov=app` reports coverage, which is kept near 100%
- The SQLite database lives at data/pm_mvp.db (gitignored) and is created on startup if missing; in Docker, data/ is the only directory mounted from the host, so it survives rebuilds

## Expected behavior

- /api/health returns service status metadata
- /api/ai/health sends a trivial prompt through OpenRouter (see app/ai.py) and returns the model's reply, or a 502 if the call fails
- / serves the built Next.js static export from app/static, which the Dockerfile fills in at image build time (gitignored; copy frontend/out/* there by hand for a bare uvicorn run)
- /api/auth/register, /login, /logout, /me, /password (app/auth.py) manage accounts and bearer-token sessions; every other /api route except the health checks requires `Authorization: Bearer <token>` and answers 401 without a valid session
- /api/boards lists and creates the signed-in user's boards; /api/boards/{id} reads (GET), saves the board JSON (PUT), renames (PATCH), and deletes (DELETE) one; a board owned by someone else answers 404
- /api/boards/{id}/chat sends that board, conversation history, and a new message to OpenRouter (see app/ai.py::ask_about_board) and returns {reply, board}; a valid board_update from the model is persisted before responding, an unsafe one (e.g. a card id referenced but not defined) is dropped and only the reply is returned
- Board/card/column shapes live in app/models.py and are shared by the board and chat endpoints, so both enforce the same schema and referential-integrity rules
- Schema changes go through app/db.py: bump SCHEMA_VERSION and add a migration step for existing databases, with a test in tests/test_migration.py
- Phase 2 work is tracked in docs/PLAN.md