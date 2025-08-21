from sqlalchemy import create_engine, Column, Integer, String, Float, JSON, DateTime
from sqlalchemy.orm import declarative_base, sessionmaker
from sqlalchemy import inspect
from datetime import datetime
import os

DB_URL = os.getenv("DB_URL", "sqlite:///bandit.db")
engine = create_engine(DB_URL, echo=False, future=True)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)
Base = declarative_base()

class Event(Base):
    __tablename__ = "events"
    id = Column(Integer, primary_key=True)
    session_id = Column(String, index=True)
    movie_id = Column(String, index=True)
    type = Column(String)  # click/save/finish/dismiss
    reward = Column(Float, default=0.0)
    at = Column(DateTime, default=datetime.utcnow)
    features = Column(JSON)

class LinUCBSnapshot(Base):
    __tablename__ = "linucb"
    id = Column(Integer, primary_key=True)
    movie_id = Column(String, unique=True, index=True)
    A = Column(JSON)  # dxd
    b = Column(JSON)  # dx1

def init_db():
    engine = get_engine()
    if not inspect(engine).has_table("events"):
        Base.metadata.create_all(engine)
