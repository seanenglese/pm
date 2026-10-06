import asyncio

import httpx
import pytest

from app import ai


class FakeResponse:
    def __init__(self, status_code, payload=None, text=""):
        self.status_code = status_code
        self._payload = payload
        self.text = text

    def json(self):
        return self._payload


class FakeAsyncClient:
    def __init__(self, response=None, exception=None):
        self._response = response
        self._exception = exception

    async def __aenter__(self):
        return self

    async def __aexit__(self, *args):
        return False

    async def post(self, *args, **kwargs):
        if self._exception:
            raise self._exception
        return self._response


@pytest.fixture(autouse=True)
def openrouter_key(monkeypatch):
    monkeypatch.setenv("OPENROUTER_API_KEY", "test-key")


def _fake_client(monkeypatch, **kwargs) -> None:
    monkeypatch.setattr(ai.httpx, "AsyncClient", lambda **_: FakeAsyncClient(**kwargs))


def test_call_openrouter_returns_message_content(monkeypatch):
    response = FakeResponse(200, {"choices": [{"message": {"content": "4"}}]})
    _fake_client(monkeypatch, response=response)

    reply = asyncio.run(ai.call_openrouter([{"role": "user", "content": "2 + 2?"}]))

    assert reply == "4"


def test_call_openrouter_raises_when_key_missing(monkeypatch):
    monkeypatch.delenv("OPENROUTER_API_KEY", raising=False)

    with pytest.raises(ai.AIConnectionError):
        asyncio.run(ai.call_openrouter([{"role": "user", "content": "2 + 2?"}]))


def test_call_openrouter_raises_on_non_200_response(monkeypatch):
    response = FakeResponse(401, text="unauthorized")
    _fake_client(monkeypatch, response=response)

    with pytest.raises(ai.AIConnectionError):
        asyncio.run(ai.call_openrouter([{"role": "user", "content": "2 + 2?"}]))


@pytest.mark.parametrize(
    "payload",
    [
        pytest.param(
            {"error": {"code": 502, "message": "Provider returned error"}},
            id="error-body",
        ),
        pytest.param({"choices": []}, id="no-choices"),
        pytest.param({"choices": [{"message": {"content": None}}]}, id="null-content"),
    ],
)
def test_call_openrouter_raises_on_unusable_200_response(monkeypatch, payload):
    response = FakeResponse(200, payload)
    _fake_client(monkeypatch, response=response)

    with pytest.raises(ai.AIConnectionError):
        asyncio.run(ai.call_openrouter([{"role": "user", "content": "2 + 2?"}]))


def test_call_openrouter_raises_on_network_error(monkeypatch):
    _fake_client(monkeypatch, exception=httpx.ConnectError("boom"))

    with pytest.raises(ai.AIConnectionError):
        asyncio.run(ai.call_openrouter([{"role": "user", "content": "2 + 2?"}]))
