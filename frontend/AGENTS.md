# Frontend

This directory contains the Next.js application for the project management MVP.

## Current state

- The app includes a Kanban board with drag-and-drop interactions
- Board state is loaded from and persisted to the FastAPI backend (`/api/users/{username}/board`) instead of living only in local React state
- A chat sidebar (`ChatSidebar`) sits alongside the board, backed by `POST /api/users/{username}/chat`; the assistant can answer questions and propose board edits, which `KanbanBoard` applies immediately from the chat response (no extra fetch or manual refresh)
- The UI is intentionally simple and uses a small set of branded colors and layout patterns

## Key areas

- src/app: app shell and page entry point
- src/components: Kanban board, column, card, and chat sidebar UI
- src/lib: board data model, drag logic, and the API client (`lib/api.ts` — board CRUD and `sendChatMessage`)
- src/test: browser and render setup for tests

## Running against the backend

Relative `/api/...` calls only resolve when the frontend is served from the same origin as FastAPI (the Docker setup, or the built static export served at `/`). The Docker image runs `npm run build` itself and serves that output, so frontend changes need `docker compose up --build` (the start scripts already pass `--build`); the build output is not committed. Running `npm run dev` standalone has no backend to call, so board data won't load unless the FastAPI service is also running on the same host/port. Tests mock the board API instead of requiring a live backend (see `KanbanBoard.test.tsx` and `tests/kanban.spec.ts`).

## Validation

- Run `npm install` once to install the project dependencies
- Use `npm test` for the unit test suite
- Use `npm run test:e2e` for browser-level validation

## Development intent

The frontend is fully connected to the FastAPI backend: board persistence and the AI chat sidebar are both wired up and verified against the real backend + OpenRouter (see docs/PLAN.md). No planned frontend work remains from the original MVP scope.
