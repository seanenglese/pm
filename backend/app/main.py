from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles

from app import auth, boards
from app.ai import AIConnectionError, call_openrouter
from app.db import init_db


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    auth.ensure_demo_user()
    yield


app = FastAPI(title="PM Backend", lifespan=lifespan)
STATIC_DIR = Path(__file__).resolve().parent / "static"

app.include_router(auth.router)
app.include_router(boards.router)


@app.get("/api/health")
def health_check() -> dict[str, str]:
    return {"status": "ok", "service": "pm-mvp"}


@app.get("/api/ai/health")
async def ai_health() -> dict[str, str]:
    try:
        reply = await call_openrouter(
            [{"role": "user", "content": "What is 2 + 2? Reply with only the digit."}]
        )
    except AIConnectionError as error:
        raise HTTPException(status_code=502, detail=str(error)) from error

    return {"status": "ok", "reply": reply}


# check_dir=False: the static export only exists after a frontend build (always true in Docker).
app.mount("/", StaticFiles(directory=STATIC_DIR, html=True, check_dir=False), name="static")
