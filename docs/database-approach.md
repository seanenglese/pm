# Database approach

The app uses SQLite because it is local, lightweight, and fits the containerized deployment model.

The database file is `backend/data/pm_mvp.db`. The backend creates it (and the tables) on startup if it does not exist (`app/db.py::init_db`). In Docker, `backend/data/` is mounted from the host, so data survives container rebuilds. The file is gitignored.

## Design

- `users` holds accounts: a unique username and a salted scrypt password hash.
- `sessions` holds sign-in sessions. The client keeps a random bearer token; only its SHA-256 hash is stored, with an expiry (30 days).
- `boards` holds any number of named boards per user. Each board is a single serialized Kanban board in `board_json`, so the app can evolve quickly without a normalized schema for cards and columns.
- Deleting a user cascades to their sessions and boards (`ON DELETE CASCADE`, with `PRAGMA foreign_keys = ON` on every connection).

## Entity overview

### users

- `id`: primary key
- `username`: unique, 3-32 letters, digits, `.`, `_` or `-`
- `password_hash`: `scrypt$<salt hex>$<hash hex>`; null for accounts migrated from the pre-accounts schema (they cannot sign in)
- `created_at`

### sessions

- `token_hash`: primary key, SHA-256 of the bearer token
- `user_id`: foreign key to `users.id`
- `expires_at`: unix time; expired rows are swept on sign-in

### boards

- `id`: primary key, used in board URLs (`/api/boards/{id}`)
- `user_id`: foreign key to `users.id`; every board query is scoped to the signed-in user, and another user's board answers 404
- `name`: shown in the board tabs
- `board_json`: a JSON blob containing the board structure
- `created_at`, `updated_at`

## Schema versions and migration

`PRAGMA user_version` records the schema version (currently 1). A version-0 database from the single-board MVP (a `boards` table keyed by `user_id`, no passwords) is migrated in place on startup: each user's board becomes a board named "My board", and `users` gains `password_hash`. The demo account (`user` / `password`) is given its password on every startup if it has none, so it keeps working after the migration.

## Board JSON structure

```json
{
  "columns": [
    { "id": "col-backlog", "title": "Backlog", "cardIds": ["card-1", "card-2"] }
  ],
  "cards": {
    "card-1": {
      "id": "card-1",
      "title": "Align roadmap themes",
      "details": "Draft quarterly themes with impact statements and metrics.",
      "priority": "high",
      "dueDate": "2026-11-05",
      "labels": ["planning"]
    }
  }
}
```

This matches the frontend data model. `app/models.py` validates it on every write (from the UI or the AI assistant). `priority` (`low` / `medium` / `high` / null), `dueDate` (ISO date or null), and `labels` (up to 10 strings) were added after the first release and have defaults, so older stored boards still validate; the API fills them in on read. Adding a card field this way needs no migration, as long as it has a default.

## Why this is a good fit

- No extra database service is required.
- It stays aligned with the frontend board structure.
- It is easy to inspect and reset locally during development.
