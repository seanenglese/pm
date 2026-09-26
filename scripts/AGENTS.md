# Scripts

This folder contains the local start and stop commands for the Dockerized app.

## Purpose

- Start the full local stack with Docker Compose
- Stop the stack cleanly when development is complete
- Support multiple operating systems with matching behavior

## Supported operating systems

- macOS: start.sh / stop.sh
- Linux: start.sh / stop.sh
- Windows PowerShell: start.ps1 / stop.ps1
- Windows Command Prompt: start.bat / stop.bat

## Expected behavior

Each script should:

- resolve the project root
- run docker compose up --build for startup
- run docker compose down for shutdown
- preserve a simple, consistent workflow for local development

Because startup always rebuilds the image, the frontend served at `/` always matches the current source. Board data lives in `backend/data/pm_mvp.db` on the host (mounted into the container), so it survives stop/start and rebuilds; delete that file to reset every board to the default.