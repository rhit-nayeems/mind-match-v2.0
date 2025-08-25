# backend/app/db.py
import os
from datetime import datetime, timezone

from sqlalchemy import (
    create_engine, Column, Integer, Float, String, DateTime, Index
)
from sqlalchemy.orm import declarative_base, sessionmaker
from sqlalchemy.exc import OperationalError

# JSON type for SQLite / others
try:
    from sqlalchemy import JSON
except Exception:
    from sqlalchemy.dialects.sqlite import JSON  # type: ignore

Base = declarative_base()

# cached engine + session factory
_engine = None
SessionLocal = sessionmaker(autocommit=False, autoflush=False)

def _db_url():
    """
    Use BANDIT_DB_URL if provided; otherwise a local SQLite file.
    Render will mount your app at /app, so this is a safe default path.
    """
    url = os.environ.get("BANDIT_DB_URL")
    if url:
        return url
    path = os.environ.get("BANDIT_DB_PATH", "/app/app/datasets/bandit.db")
    os.makedirs(os.path.dirname(path), exist_ok=True)
    return f"sqlite:///{path}"

def get_engine():
    """Create and cache the engine; safe to call multiple times."""
    global _engine
    if _engine is None:
        url = _db_url()
        if url.startswith("sqlite:///"):
            _engine = create_engine(url, future=True, connect_args={"check_same_thread": False})
        else:
            _engine = create_engine(url, future=True, pool_pre_ping=True)
        SessionLocal.configure(bind=_engine)
    return _engine


# ---------------- Models ----------------

class Event(Base):
    __tablename__ = "events"
    id = Column(Integer, primary_key=True)
    session_id = Column(String, index=True)
    movie_id = Column(String, index=True)
    type = Column(String)
    reward = Column(Float, default=0.0)
    # Map Python attribute 'ts' to DB column named 'at'
    ts = Column("at", DateTime(timezone=True), nullable=True)
    features = Column(JSON, default=dict)

    __table_args__ = (
        Index("ix_events_session_ts", "session_id", "at"),
    )


class LinUCBSnapshot(Base):
    """
    Minimal snapshot table so bandit.py can import it.
    If your bandit code writes different field names, you can extend this class,
    but these are the usual suspects (per-arm matrix/vector and timestamp).
    """
    __tablename__ = "linucb_snapshots"
    id = Column(Integer, primary_key=True)
    movie_id = Column(String, index=True)
    A = Column(JSON, default=dict)  # design matrix per arm
    b = Column(JSON, default=dict)  # reward vector per arm
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))


# -------------- Init --------------------

def init_db():
    """Create tables if needed; tolerate first-boot races."""
    eng = get_engine()
    try:
        # checkfirst=True avoids 'table already exists' explosions on Render
        Base.metadata.create_all(eng, checkfirst=True)
    except OperationalError as e:
        # Harmless if two processes raced to create tables
        if "already exists" not in str(e).lower():
            raise
