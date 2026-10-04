import time

import pytest

from app import auth, db
from app.auth import hash_password, verify_password


def _login(client, username: str, password: str):
    return client.post("/api/auth/login", json={"username": username, "password": password})


def test_password_hash_round_trip() -> None:
    stored = hash_password("s3cret-pass")

    assert stored.startswith("scrypt$")
    assert "s3cret-pass" not in stored
    assert verify_password("s3cret-pass", stored)
    assert not verify_password("wrong-pass", stored)
    assert not verify_password("anything", None)


def test_same_password_hashes_differently_each_time() -> None:
    assert hash_password("same-password") != hash_password("same-password")


def test_register_returns_token_user_and_a_starter_board(client) -> None:
    response = client.post(
        "/api/auth/register", json={"username": "alice", "password": "alice-pass"}
    )

    assert response.status_code == 201
    body = response.json()
    assert body["user"]["username"] == "alice"
    assert body["token"]

    headers = {"Authorization": f"Bearer {body['token']}"}
    boards = client.get("/api/boards", headers=headers).json()
    assert [board["name"] for board in boards] == ["My first board"]


def test_register_rejects_a_taken_username(client, register) -> None:
    register("bob")

    response = client.post(
        "/api/auth/register", json={"username": "bob", "password": "another-pass"}
    )

    assert response.status_code == 409


@pytest.mark.parametrize(
    "payload",
    [
        pytest.param({"username": "ab", "password": "long-enough"}, id="short-username"),
        pytest.param({"username": "has space", "password": "long-enough"}, id="bad-chars"),
        pytest.param({"username": "x" * 33, "password": "long-enough"}, id="long-username"),
        pytest.param({"username": "carol", "password": "short"}, id="short-password"),
        pytest.param({"username": "carol"}, id="missing-password"),
    ],
)
def test_register_validates_input(client, payload) -> None:
    response = client.post("/api/auth/register", json=payload)

    assert response.status_code == 422


def test_login_with_valid_credentials(client, register) -> None:
    register("dave", "dave-password")

    response = _login(client, "dave", "dave-password")

    assert response.status_code == 200
    assert response.json()["user"]["username"] == "dave"
    assert response.json()["token"]


@pytest.mark.parametrize(
    ("username", "password"),
    [("dave", "wrong-password"), ("nobody", "dave-password")],
)
def test_login_rejects_bad_credentials(client, register, username, password) -> None:
    register("dave", "dave-password")

    response = _login(client, username, password)

    assert response.status_code == 401
    assert response.json()["detail"] == "Invalid username or password"


def test_demo_account_can_sign_in(client) -> None:
    response = _login(client, "user", "password")

    assert response.status_code == 200
    headers = {"Authorization": f"Bearer {response.json()['token']}"}
    boards = client.get("/api/boards", headers=headers).json()
    assert len(boards) == 1


def test_ensure_demo_user_is_idempotent(client) -> None:
    auth.ensure_demo_user()
    auth.ensure_demo_user()

    token = _login(client, "user", "password").json()["token"]
    boards = client.get("/api/boards", headers={"Authorization": f"Bearer {token}"})
    assert len(boards.json()) == 1


def test_me_returns_the_signed_in_user(client, register) -> None:
    headers, user = register("erin")

    response = client.get("/api/auth/me", headers=headers)

    assert response.status_code == 200
    assert response.json() == user


@pytest.mark.parametrize(
    "headers",
    [
        pytest.param({}, id="no-header"),
        pytest.param({"Authorization": "Bearer not-a-real-token"}, id="unknown-token"),
        pytest.param({"Authorization": "Basic abc"}, id="wrong-scheme"),
    ],
)
def test_me_requires_a_valid_session(client, headers) -> None:
    response = client.get("/api/auth/me", headers=headers)

    assert response.status_code == 401


def test_expired_session_is_rejected(client, register, monkeypatch) -> None:
    headers, _ = register()
    real_time = time.time
    monkeypatch.setattr(time, "time", lambda: real_time() + auth.SESSION_TTL_SECONDS + 1)

    response = client.get("/api/auth/me", headers=headers)

    assert response.status_code == 401


def test_logout_ends_only_that_session(client, register) -> None:
    headers, _ = register("frank", "frank-password")
    other_token = _login(client, "frank", "frank-password").json()["token"]

    response = client.post("/api/auth/logout", headers=headers)

    assert response.status_code == 204
    assert client.get("/api/auth/me", headers=headers).status_code == 401
    other = {"Authorization": f"Bearer {other_token}"}
    assert client.get("/api/auth/me", headers=other).status_code == 200


def test_change_password(client, register) -> None:
    headers, _ = register("gina", "old-password")
    other_token = _login(client, "gina", "old-password").json()["token"]

    response = client.put(
        "/api/auth/password",
        headers=headers,
        json={"currentPassword": "old-password", "newPassword": "new-password"},
    )

    assert response.status_code == 204
    assert _login(client, "gina", "old-password").status_code == 401
    assert _login(client, "gina", "new-password").status_code == 200
    # The session that made the change survives; every other one is signed out.
    assert client.get("/api/auth/me", headers=headers).status_code == 200
    other = {"Authorization": f"Bearer {other_token}"}
    assert client.get("/api/auth/me", headers=other).status_code == 401


def test_change_password_requires_the_current_password(client, register) -> None:
    headers, _ = register("hank", "old-password")

    response = client.put(
        "/api/auth/password",
        headers=headers,
        json={"currentPassword": "not-it", "newPassword": "new-password"},
    )

    assert response.status_code == 400
    assert _login(client, "hank", "old-password").status_code == 200


def test_change_password_validates_new_password(client, register) -> None:
    headers, _ = register("ivan", "old-password")

    response = client.put(
        "/api/auth/password",
        headers=headers,
        json={"currentPassword": "old-password", "newPassword": "short"},
    )

    assert response.status_code == 422


def test_login_clears_expired_sessions(client, register, monkeypatch) -> None:
    register("jane", "jane-password")
    real_time = time.time
    monkeypatch.setattr(time, "time", lambda: real_time() + auth.SESSION_TTL_SECONDS + 1)

    _login(client, "jane", "jane-password")

    with db.db_connection() as connection:
        count = connection.execute("SELECT COUNT(*) FROM sessions").fetchone()[0]
    assert count == 1


def _delete_account(client, headers, password: str):
    return client.request("DELETE", "/api/auth/me", headers=headers, json={"password": password})


def test_delete_account_removes_the_user_boards_and_sessions(client, register) -> None:
    headers, user = register("kate", "kate-password")
    other_token = _login(client, "kate", "kate-password").json()["token"]
    client.post("/api/boards", headers=headers, json={"name": "Second"})

    response = _delete_account(client, headers, "kate-password")

    assert response.status_code == 204
    assert client.get("/api/auth/me", headers=headers).status_code == 401
    other = {"Authorization": f"Bearer {other_token}"}
    assert client.get("/api/auth/me", headers=other).status_code == 401
    assert _login(client, "kate", "kate-password").status_code == 401
    with db.db_connection() as connection:
        boards = connection.execute(
            "SELECT COUNT(*) FROM boards WHERE user_id = ?", (user["id"],)
        ).fetchone()[0]
    assert boards == 0


def test_delete_account_frees_the_username(client, register) -> None:
    headers, _ = register("liam", "liam-password")
    _delete_account(client, headers, "liam-password")

    response = client.post(
        "/api/auth/register", json={"username": "liam", "password": "fresh-password"}
    )

    assert response.status_code == 201


def test_delete_account_requires_the_password(client, register) -> None:
    headers, _ = register("mia", "mia-password")

    response = _delete_account(client, headers, "wrong-password")

    assert response.status_code == 400
    assert response.json()["detail"] == "Password is incorrect"
    assert client.get("/api/auth/me", headers=headers).status_code == 200


def test_delete_account_leaves_other_users_alone(client, register, headers, board_id) -> None:
    doomed, _ = register("nora", "nora-password")

    _delete_account(client, doomed, "nora-password")

    assert client.get(f"/api/boards/{board_id}", headers=headers).status_code == 200


def test_delete_account_requires_a_session(client) -> None:
    response = client.request("DELETE", "/api/auth/me", json={"password": "x"})

    assert response.status_code == 401
