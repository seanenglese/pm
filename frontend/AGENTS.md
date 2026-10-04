# Frontend

This directory contains the Next.js application for the project management app.

## Current state

- Sign in or create an account (`AuthForm`); the session token is kept in `localStorage`, so a reload stays signed in, and any 401 from the API returns to sign-in
- A signed-in user sees `Workspace`: an app bar, a tab per board, and controls to create, switch, rename, and delete boards
- Each board (`KanbanBoard`) has drag-and-drop cards and is loaded from and persisted to the FastAPI backend (`/api/boards/{id}`)
- A chat sidebar (`ChatSidebar`) sits alongside the board, backed by `POST /api/boards/{id}/chat`; the assistant can answer questions and propose board edits, which `KanbanBoard` applies immediately from the chat response (no extra fetch or manual refresh)
- The UI is intentionally simple and uses a small set of branded colors and layout patterns

## Key areas

- src/app: app shell and page entry point (session restore, signed-in vs signed-out)
- src/components: auth form, workspace, Kanban board, column, card, and chat sidebar UI
- src/lib: board data model, drag logic, and the API client (`lib/api.ts`)
- src/test: test setup and `fakeApi.ts`, an in-memory fake of the backend API used by component tests

## Running against the backend

Relative `/api/...` calls only resolve when the frontend is served from the same origin as FastAPI (the Docker setup, or the built static export served at `/`). The Docker image runs `npm run build` itself and serves that output, so frontend changes need `docker compose up --build` (the start scripts already pass `--build`); the build output is not committed. Running `npm run dev` standalone has no backend to call, so nothing loads unless the FastAPI service is also running on the same host/port.

## Validation

- Run `npm install` once to install the project dependencies
- Use `npm test` for the unit test suite (`npx vitest run --coverage` for coverage); component tests install `src/test/fakeApi.ts` as `fetch`, so extend the fake when you add an endpoint
- Use `npm run test:e2e` for integration tests: Playwright builds the real Docker image and runs it with a throwaway database (see `tests/global-setup.ts`), so it needs Docker running
