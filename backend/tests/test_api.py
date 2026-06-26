"""
backend/tests/test_api.py
--------------------------
Integration tests for the SignBridge FastAPI backend.

Run with:
    pytest backend/tests/ -v
"""

import sys
from pathlib import Path

import numpy as np
import pytest
from fastapi.testclient import TestClient

# Add backend to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from main import app

client = TestClient(app)


# ── Health ──────────────────────────────────────────────
def test_root():
    r = client.get("/")
    assert r.status_code == 200
    assert r.json()["app"] == "SignBridge API"


def test_health():
    r = client.get("/api/health")
    assert r.status_code == 200
    data = r.json()
    assert "status" in data
    assert data["status"] == "healthy"


# ── Predict ─────────────────────────────────────────────
def _make_landmarks(seed=42):
    rng = np.random.default_rng(seed)
    return rng.uniform(0, 1, 63).tolist()


def test_predict_valid():
    r = client.post("/api/predict", json={"landmarks": _make_landmarks()})
    assert r.status_code == 200
    data = r.json()
    assert "confidence" in data
    assert "inference_ms" in data
    assert isinstance(data["alternatives"], list)


def test_predict_wrong_size():
    r = client.post("/api/predict", json={"landmarks": [0.5] * 30})
    assert r.status_code == 400


def test_predict_empty():
    r = client.post("/api/predict", json={"landmarks": []})
    assert r.status_code == 400


# ── Translations ─────────────────────────────────────────
def test_save_and_retrieve_translation():
    # Save
    r = client.post("/api/translations", json={"text": "HELLO TEST"})
    assert r.status_code == 200
    assert r.json()["saved"] is True

    # Retrieve
    r2 = client.get("/api/translations")
    assert r2.status_code == 200
    texts = [item["text"] for item in r2.json()]
    assert "HELLO TEST" in texts


def test_save_empty_translation():
    r = client.post("/api/translations", json={"text": "   "})
    assert r.status_code == 400


def test_clear_translations():
    client.post("/api/translations", json={"text": "TEMP"})
    r = client.delete("/api/translations")
    assert r.status_code == 200
    assert r.json()["cleared"] is True


# ── Feedback ─────────────────────────────────────────────
def test_submit_feedback():
    r = client.post("/api/feedback", json={
        "name": "Test User",
        "email": "test@example.com",
        "subject": "bug",
        "message": "The classifier misidentified my A as S.",
    })
    assert r.status_code == 200
    assert r.json()["submitted"] is True


def test_submit_feedback_empty_message():
    r = client.post("/api/feedback", json={"message": ""})
    assert r.status_code == 400
