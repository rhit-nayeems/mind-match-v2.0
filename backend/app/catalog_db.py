# app/catalog_db.py
"""
Lightweight DB layer around the ingested SQLite file and a recommender.
"""
from __future__ import annotations
import os, json, sqlite3, math
from typing import Dict, Any, List, Tuple

DB_PATH = os.environ.get("MOVIES_DB", os.path.join(os.path.dirname(__file__), "data", "movies.db"))

TRAITS = ["darkness","energy","mood","depth","optimism","novelty","comfort","intensity","humor"]

def _connect() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def _cosine(a: List[float], b: List[float]) -> float:
    num = sum(x*y for x,y in zip(a,b))
    da = math.sqrt(sum(x*x for x in a)) or 1e-9
    db = math.sqrt(sum(y*y for y in b)) or 1e-9
    return num / (da*db)

def top_matches(user_traits: Dict[str, float], limit: int = 6, prefilter: int = 200) -> List[Dict[str, Any]]:
    """
    Returns top-N movies by cosine similarity in trait space.
    prefilter: how many most-popular rows to scan (for large DBs increase or use a vector index).
    """
    uvec = [float(user_traits.get(k, 0.0)) for k in TRAITS]
    with _connect() as conn:
        cur = conn.cursor()
        cur.execute("SELECT tmdb_id, title, year, overview, poster_url, genres, keywords, director, vote_average, vote_count, popularity, providers, traits FROM movies ORDER BY popularity DESC LIMIT ?", (prefilter,))
        rows = cur.fetchall()

    scored = []
    for r in rows:
        traits = json.loads(r["traits"] or "{}")
        mvec = [float(traits.get(k, 0.0)) for k in TRAITS]
        score = _cosine(uvec, mvec)
        scored.append((score, r))

    scored.sort(key=lambda x: x[0], reverse=True)
    out = []
    for score, r in scored[:limit]:
        out.append({
            "id": r["tmdb_id"],
            "title": r["title"],
            "year": r["year"],
            "posterUrl": r["poster_url"],
            "synopsis": r["overview"],
            "traits": json.loads(r["traits"] or "{}"),
            "match": round(score, 4),
            "genre": json.loads(r["genres"] or "[]"),
            "director": r["director"],
            "rating": "NR",
            "where_to_watch": json.loads(r["providers"] or "{}").get("US", []),
        })
    return out
