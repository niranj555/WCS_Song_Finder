import os

import pytest

os.environ.setdefault("ANTHROPIC_API_KEY", "test-key")
os.environ.setdefault("APP_USERNAME", "test")
os.environ.setdefault("APP_PASSWORD", "test")
os.environ.setdefault("SESSION_SECRET", "test-secret")
os.environ.setdefault("AUDD_API_KEY", "")

from fastapi.testclient import TestClient
from main import app


def _login(tc):
    tc.post("/", data={"username": "test", "password": "test"})


def test_identify_requires_auth():
    with TestClient(app) as tc:
        res = tc.post("/identify", files={"audio": ("clip.webm", b"fake", "audio/webm")})
    assert res.status_code == 401


def test_identify_returns_503_when_no_api_key():
    with TestClient(app) as tc:
        _login(tc)
        res = tc.post("/identify", files={"audio": ("clip.webm", b"fake", "audio/webm")})
    assert res.status_code == 503
    assert "AUDD_API_KEY" in res.json()["error"]
