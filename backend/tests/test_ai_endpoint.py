from app import main
from app.ai import AIConnectionError


def test_ai_health_returns_the_model_reply(client, monkeypatch) -> None:
    async def fake_call_openrouter(messages: list[dict]) -> str:
        assert "2 + 2" in messages[0]["content"]
        return "4"

    monkeypatch.setattr(main, "call_openrouter", fake_call_openrouter)

    response = client.get("/api/ai/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok", "reply": "4"}


def test_ai_health_returns_502_when_openrouter_fails(client, monkeypatch) -> None:
    async def failing_call_openrouter(messages: list[dict]) -> str:
        raise AIConnectionError("OpenRouter request failed: 401 unauthorized")

    monkeypatch.setattr(main, "call_openrouter", failing_call_openrouter)

    response = client.get("/api/ai/health")

    assert response.status_code == 502
    assert "unauthorized" in response.json()["detail"]
