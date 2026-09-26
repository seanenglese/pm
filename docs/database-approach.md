# Database approach

The MVP uses SQLite because it is local, lightweight, and fits the containerized deployment model.

The database file is `backend/data/pm_mvp.db`. The backend creates it (and the tables) on startup if it does not exist. In Docker, `backend/data/` is mounted from the host, so data survives container rebuilds. The file is gitignored.

## Design

- One `users` table stores the usernames for future multi-user support.
- One `boards` table stores a single serialized Kanban board for each user.
- The board itself is kept as JSON in `board_json` so the MVP can evolve quickly without a full normalized schema for cards and columns.
- This keeps the implementation simple while leaving room to move to relational tables later if the app grows.

## Entity overview

### users

- `id`: primary key
- `username`: unique string used for sign-in and future user scoping
- `created_at`: timestamp for auditability

### boards

- `user_id`: foreign key to `users.id`
- `board_json`: a JSON blob containing the board structure
- `updated_at`: timestamp for the last write

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
      "details": "Draft quarterly themes with impact statements and metrics."
    }
  }
}
```

This matches the existing frontend data model and keeps the board API straightforward: read the board for the signed-in user, update it, and save it back to SQLite.

## Why this is a good fit for the MVP

- No extra database service is required.
- The schema supports future multi-user expansion.
- It stays aligned with the current frontend board structure.
- It is easy to inspect and reset locally during development.
