import pytest

from app import main as app_main


@pytest.fixture(autouse=True)
def isolated_db(tmp_path, monkeypatch):
    monkeypatch.setattr(app_main, "DB_PATH", tmp_path / "test.db")
    app_main.init_db()
