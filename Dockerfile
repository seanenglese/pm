FROM node:20-bookworm-slim AS frontend-builder

WORKDIR /src/frontend
COPY frontend/package*.json ./
RUN npm install
COPY frontend .
RUN npm run build

FROM python:3.12-slim

WORKDIR /app

RUN pip install --no-cache-dir uv

COPY backend/pyproject.toml ./backend/pyproject.toml
COPY backend/app ./backend/app
COPY --from=frontend-builder /src/frontend/out ./backend/app/static

WORKDIR /app/backend
RUN uv sync --no-dev

EXPOSE 8000

CMD ["uv", "run", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
