from __future__ import annotations
from typing import Dict
import numpy as np
from .db import SessionLocal, LinUCBSnapshot

class LinUCB:
    def __init__(self, d: int = 27, alpha: float = 0.6):
        self.d = d
        self.alpha = alpha

    def _load_arm(self, session, movie_id: str):
        snap = session.query(LinUCBSnapshot).filter_by(movie_id=movie_id).one_or_none()
        if not snap:
            A = np.eye(self.d).tolist()
            b = np.zeros((self.d,)).tolist()
            snap = LinUCBSnapshot(movie_id=movie_id, A=A, b=b)
            session.add(snap)
            session.commit()
        else:
            A = np.array(snap.A, dtype=float)
            b = np.array(snap.b, dtype=float)
        return snap, A, b

    def score(self, session, movie_id: str, x: np.ndarray) -> float:
        snap, A, b = self._load_arm(session, movie_id)
        A_inv = np.linalg.inv(A)
        theta = A_inv @ b
        mean = float(theta @ x)
        ucb = self.alpha * float(np.sqrt(x @ A_inv @ x))
        return mean + ucb

    def update(self, session, movie_id: str, x: np.ndarray, reward: float):
        snap, A, b = self._load_arm(session, movie_id)
        A = np.array(snap.A, dtype=float)
        b = np.array(snap.b, dtype=float)
        A += np.outer(x, x)
        b += reward * x
        snap.A = A.tolist(); snap.b = b.tolist()
        session.add(snap); session.commit()

def features(user: Dict[str,float], movie: Dict[str,float]) -> np.ndarray:
    keys = ["energy","mood","depth","optimism","novelty","comfort","intensity","humor","darkness"]
    u = np.array([user.get(k,0.5) for k in keys])
    v = np.array([movie.get(k,0.5) for k in keys])
    return np.concatenate([u, v, np.abs(u - v)]).astype(float)
