import hashlib
import hmac
import secrets
import sqlite3
import time
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Response, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, ConfigDict, Field

from app.db import create_board, db_connection

SESSION_TTL_SECONDS = 30 * 24 * 60 * 60
DEMO_USERNAME = "user"
DEMO_PASSWORD = "password"

router = APIRouter(prefix="/api/auth", tags=["auth"])
bearer = HTTPBearer(auto_error=False)


class Credentials(BaseModel):
    model_config = ConfigDict(extra="forbid")

    username: str = Field(min_length=3, max_length=32, pattern=r"^[A-Za-z0-9_.-]+$")
    password: str = Field(min_length=8, max_length=128)


class LoginRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    username: str
    password: str


class PasswordChange(BaseModel):
    model_config = ConfigDict(extra="forbid")

    currentPassword: str
    newPassword: str = Field(min_length=8, max_length=128)


class AccountDeletion(BaseModel):
    model_config = ConfigDict(extra="forbid")

    password: str


class User(BaseModel):
    id: int
    username: str
    createdAt: str


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.scrypt(password.encode(), salt=salt, n=2**14, r=8, p=1)
    return f"scrypt${salt.hex()}${digest.hex()}"


def verify_password(password: str, stored: str | None) -> bool:
    if not stored:
        return False
    _, salt_hex, digest_hex = stored.split("$")
    digest = hashlib.scrypt(
        password.encode(), salt=bytes.fromhex(salt_hex), n=2**14, r=8, p=1
    )
    return hmac.compare_digest(digest.hex(), digest_hex)


def _token_hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def _user_from_row(row: sqlite3.Row) -> User:
    return User(id=row["id"], username=row["username"], createdAt=row["created_at"])


def create_session(connection: sqlite3.Connection, user_id: int) -> str:
    token = secrets.token_urlsafe(32)
    connection.execute(
        "INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)",
        (_token_hash(token), user_id, int(time.time()) + SESSION_TTL_SECONDS),
    )
    return token


def ensure_demo_user() -> None:
    """Give the demo account a password so it can always sign in."""
    with db_connection() as connection:
        row = connection.execute(
            "SELECT password_hash FROM users WHERE username = ?", (DEMO_USERNAME,)
        ).fetchone()
        if row is None:

            cursor = connection.execute(
                "INSERT INTO users (username, password_hash) VALUES (?, ?)",
                (DEMO_USERNAME, hash_password(DEMO_PASSWORD)),
            )
            create_board(connection, cursor.lastrowid, "My board", sample=True)
        elif row["password_hash"] is None:
            connection.execute(
                "UPDATE users SET password_hash = ? WHERE username = ?",
                (hash_password(DEMO_PASSWORD), DEMO_USERNAME),
            )


def get_current_user(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer)],
) -> User:
    if credentials is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Not signed in")
    with db_connection() as connection:
        row = connection.execute(
            """
            SELECT users.id, users.username, users.created_at FROM sessions
            JOIN users ON users.id = sessions.user_id
            WHERE sessions.token_hash = ? AND sessions.expires_at > ?
            """,
            (_token_hash(credentials.credentials), int(time.time())),
        ).fetchone()
    if row is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Session expired")
    return _user_from_row(row)


CurrentUser = Annotated[User, Depends(get_current_user)]


@router.post("/register", status_code=status.HTTP_201_CREATED)
def register(payload: Credentials) -> dict:

    with db_connection() as connection:
        try:
            cursor = connection.execute(
                "INSERT INTO users (username, password_hash) VALUES (?, ?)",
                (payload.username, hash_password(payload.password)),
            )
        except sqlite3.IntegrityError as error:
            raise HTTPException(
                status.HTTP_409_CONFLICT, "That username is already taken"
            ) from error
        user_id = cursor.lastrowid
        create_board(connection, user_id, "My first board", sample=True)
        token = create_session(connection, user_id)
        row = connection.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
        return {"token": token, "user": _user_from_row(row)}


@router.post("/login")
def login(payload: LoginRequest) -> dict:
    with db_connection() as connection:
        row = connection.execute(
            "SELECT * FROM users WHERE username = ?", (payload.username,)
        ).fetchone()
        if row is None or not verify_password(payload.password, row["password_hash"]):
            raise HTTPException(
                status.HTTP_401_UNAUTHORIZED, "Invalid username or password"
            )
        connection.execute(
            "DELETE FROM sessions WHERE expires_at <= ?", (int(time.time()),)
        )
        token = create_session(connection, row["id"])
        return {"token": token, "user": _user_from_row(row)}


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(
    user: CurrentUser,
    credentials: Annotated[HTTPAuthorizationCredentials, Depends(bearer)],
) -> Response:
    with db_connection() as connection:
        connection.execute(
            "DELETE FROM sessions WHERE token_hash = ?",
            (_token_hash(credentials.credentials),),
        )
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/me")
def me(user: CurrentUser) -> User:
    return user


@router.delete("/me", status_code=status.HTTP_204_NO_CONTENT)
def delete_account(payload: AccountDeletion, user: CurrentUser) -> Response:
    with db_connection() as connection:
        row = connection.execute(
            "SELECT password_hash FROM users WHERE id = ?", (user.id,)
        ).fetchone()
        if not verify_password(payload.password, row["password_hash"]):
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Password is incorrect")
        # Boards and sessions go with the user (ON DELETE CASCADE).
        connection.execute("DELETE FROM users WHERE id = ?", (user.id,))
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.put("/password", status_code=status.HTTP_204_NO_CONTENT)
def change_password(
    payload: PasswordChange,
    user: CurrentUser,
    credentials: Annotated[HTTPAuthorizationCredentials, Depends(bearer)],
) -> Response:
    with db_connection() as connection:
        row = connection.execute(
            "SELECT password_hash FROM users WHERE id = ?", (user.id,)
        ).fetchone()
        if not verify_password(payload.currentPassword, row["password_hash"]):
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST, "Current password is incorrect"
            )
        connection.execute(
            "UPDATE users SET password_hash = ? WHERE id = ?",
            (hash_password(payload.newPassword), user.id),
        )
        # Sign out every other session; the one making the change stays valid.
        connection.execute(
            "DELETE FROM sessions WHERE user_id = ? AND token_hash != ?",
            (user.id, _token_hash(credentials.credentials)),
        )
    return Response(status_code=status.HTTP_204_NO_CONTENT)
