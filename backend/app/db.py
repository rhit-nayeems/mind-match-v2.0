# backend/app/db.py
import os
from datetime import datetime, timezone

from sqlalchemy import create_engine, Column, Integer, Float, String, DateTime
from sqlalchemy.orm import declarative_base, sessionmaker
from sqlalchemy.exc import OperationalError

# SQLite JSON works fine via SQLite's JSON affinity; fall back if needed.
try:
    from sqlalchemy import JSON
except Exception:
    from sqlalchemy.dialects.sqlite import JSON  # type: ignore

Base = declarative_base()

# cached engine + session factory
_engine = None
SessionLocal = sessionmaker(autocommit=False, autoflush=False)

def _db_url_and_path():
    """Prefer explicit URL; otherwise keep a simple SQLite file."""
    url = os.environ.get("BANDIT_DB_URL")
    if url:
        return url
    path = os.environ.get("BANDIT_DB_PATH", "/app/app/datasets/bandit.db")
    os.makedirs(os.path.dirname(path), exist_ok=True)
    return f"sqlite:///{path}"

def get_engine():
    """Lazily create and cache the SQLAlchemy engine; safe to call many times."""
    global _engine
    if _engine is None:
        url = _db_url_and_path()
        if url.startswith("sqlite:///"):
            _engine = create_engine(url, future=True, connect_args={"check_same_thread": False})
        else:
            _engine = create_engine(url, future=True, pool_pre_ping=True)
        SessionLocal.configure(bind=_engine)
    return _engine

class Event(Base):
    __tablename__ = "events"
    id = Column(Integer, primary_key=True)
    session_id = Column(String)
    movie_id = Column(String)
    type = Column(String)
    reward = Column(Float, default=0.0)
    # use 'at' (timezone-aware) as the timestamp column
    at = Column(DateTime(timezone=True), nullable=True)
    features = Column(JSON, default={})

def init_db():
    """Create tables if needed. Tolerate 'already exists' races on multi-start."""
    eng = get_engine()
    try:
        Base.metadata.create_all(eng, checkfirst=True)
    except OperationalError as e:
        # harmless if two workers race during first boot
        if "already exists" not in str(e).lower():
            raise
