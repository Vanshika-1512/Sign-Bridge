"""
backend/routes/translations.py
--------------------------------
Modular route handlers for translation history endpoints.
Imported by main.py (or can be used as an APIRouter).
"""

import sqlite3
from datetime import datetime
from pathlib import Path

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter(prefix="/api", tags=["translations"])

DB_PATH = Path(__file__).parent.parent / "signbridge.db"


class TranslationIn(BaseModel):
    text: str


class FeedbackIn(BaseModel):
    name: str = ""
    email: str = ""
    subject: str = ""
    message: str


def get_conn():
    return sqlite3.connect(DB_PATH)


@router.get("/translations")
def list_translations(limit: int = 20):
    conn = get_conn()
    rows = conn.execute(
        "SELECT id, text, created FROM translations ORDER BY id DESC LIMIT ?",
        (limit,)
    ).fetchall()
    conn.close()
    return [{"id": r[0], "text": r[1], "created": r[2]} for r in rows]


@router.post("/translations")
def create_translation(req: TranslationIn):
    if not req.text.strip():
        raise HTTPException(400, "Text cannot be empty")
    conn = get_conn()
    cur = conn.execute(
        "INSERT INTO translations (text, created) VALUES (?, ?)",
        (req.text.strip(), datetime.utcnow().isoformat()),
    )
    conn.commit()
    rid = cur.lastrowid
    conn.close()
    return {"id": rid, "saved": True}


@router.delete("/translations")
def delete_translations():
    conn = get_conn()
    conn.execute("DELETE FROM translations")
    conn.commit()
    conn.close()
    return {"cleared": True}


@router.post("/feedback")
def submit_feedback(req: FeedbackIn):
    if not req.message.strip():
        raise HTTPException(400, "Message required")
    conn = get_conn()
    conn.execute(
        "INSERT INTO feedback (name,email,subject,message,created) VALUES (?,?,?,?,?)",
        (req.name, req.email, req.subject, req.message, datetime.utcnow().isoformat()),
    )
    conn.commit()
    conn.close()
    return {"submitted": True}
