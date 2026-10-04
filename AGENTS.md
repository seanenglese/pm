# The Project Management MVP web app

## Business Requirements

This project is building a Project Management App. Key features:
- Anyone can create an account (username + password) and sign in; sessions survive a page reload
- A signed-in user has any number of named Kanban boards, and can create, switch between, rename, and delete them
- Board columns can be renamed
- The cards on the Kanban board can be moved with drag and drop, and edited
- There is an AI chat feature in a sidebar; the AI is able to create / edit / move one or more cards on the open board

The MVP (one hardcoded user, one board) is complete; Phase 2 (see docs/PLAN.md) is growing it into a fuller project management app in iterations.

## Limitations

A demo account (`user` / `password`) is always available. Users' boards are private; there is no sharing yet.

This runs locally (in a docker container)

## Technical Decisions

- NextJS frontend
- Python FastAPI backend, including serving the static NextJS site at /
- Everything packaged into a Docker container
- Use "uv" as the package manager for python in the Docker container
- Use OpenRouter for the AI calls. An OPENROUTER_API_KEY is in .env in the project root
- Use `nvidia/nemotron-3-super-120b-a12b:free` as the model (originally `z-ai/glm-5.2:free`, but OpenRouter discontinued that free tier; this replacement also supports structured outputs, needed for Part 9)
- Use SQLLite local database for the database, creating a new db if it doesn't exist
- Start and Stop server scripts for Mac, PC, Linux in scripts/

## Starting Point

All business requirements above are implemented and tested, including Playwright integration tests against the real Docker image. docs/PLAN.md has the Phase 2 roadmap: check it for the next unfinished iteration and record progress there.

## Color Scheme

- Accent Yellow: `#ecad0a` - accent lines, highlights
- Blue Primary: `#209dd7` - links, key sections
- Purple Secondary: `#753991` - submit buttons, important actions
- Dark Navy: `#032147` - main headings
- Gray Text: `#888888` - supporting text, labels

## Coding standards

1. Use latest versions of libraries and idiomatic approaches as of today
2. Keep it simple - NEVER over-engineer, ALWAYS simplify, NO unnecessary defensive programming. No extra features - focus on simplicity.
3. Be concise. Keep README minimal. IMPORTANT: no emojis ever
4. When hitting issues, always identify root cause before trying a fix. Do not guess. Prove with evidence, then fix the root cause.

## Working documentation

All documents for planning and executing this project will be in the docs/ directory.
Please review the docs/PLAN.md document before proceeding.