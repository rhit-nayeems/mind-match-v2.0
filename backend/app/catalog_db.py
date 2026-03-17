"""DB helpers for the ingested movie catalog."""

from __future__ import annotations

import json
import math
import os
import sqlite3
from contextlib import closing
from pathlib import Path
from typing import Any, Dict, List

import numpy as np
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import linear_kernel

TRAITS = ["darkness", "energy", "mood", "depth", "optimism", "novelty", "comfort", "intensity", "humor"]
DEFAULT_CATALOG_MAX_MOVIES = 0

_TRAIT_QUERY_HINTS: Dict[str, List[str]] = {
    "darkness": ["dark", "noir", "bleak", "mystery", "gritty"],
    "energy": ["fast", "adventure", "dynamic", "chase", "action"],
    "mood": ["atmospheric", "moody", "night", "emotional", "cinematic"],
    "depth": ["thoughtful", "philosophical", "character", "reflective", "complex"],
    "optimism": ["uplifting", "hopeful", "warm", "heartwarming", "joy"],
    "novelty": ["original", "experimental", "weird", "fresh", "surprising"],
    "comfort": ["cozy", "comforting", "gentle", "feel-good", "family"],
    "intensity": ["intense", "thriller", "edge", "high-stakes", "tension"],
    "humor": ["funny", "comedy", "witty", "laugh", "satire"],
}

_HERE = Path(__file__).resolve().parent
DEFAULT_CATALOG_VARIANT = "full2400"
_CATALOG_VARIANT_DB_PATHS = {
    "full2400": _HERE / "datasets" / "movies_core.db",
    "curated1500": _HERE / "datasets" / "movies_curated1500.db",
}
_DEFAULT_DB_CANDIDATES = [
    _CATALOG_VARIANT_DB_PATHS[DEFAULT_CATALOG_VARIANT],
    _HERE / "datasets" / "movies.db",
    _HERE / "data" / "movies.db",
]

_CACHE: Dict[str, Any] = {
    "db_path": None,
    "mtime": None,
    "max_movies": None,
    "records": [],
    "tfidf_vectorizer": None,
    "tfidf_matrix": None,
}


def resolve_catalog_variant() -> str:
    """Resolve the active catalog variant name from the environment."""
    raw = (os.environ.get("CATALOG_VARIANT") or "").strip().lower()
    if raw in _CATALOG_VARIANT_DB_PATHS:
        return raw
    return DEFAULT_CATALOG_VARIANT



def resolve_active_catalog_variant(db_path: str | None = None) -> str:
    """Map a resolved DB path back to a known catalog variant when possible."""
    target = Path(db_path or resolve_db_path()).resolve(strict=False)
    for name, candidate in _CATALOG_VARIANT_DB_PATHS.items():
        if candidate.resolve(strict=False) == target:
            return name
    return "custom"



def resolve_db_path() -> str:
    """Resolve the catalog DB path with env override and sensible local defaults."""
    env_path = os.environ.get("MOVIES_DB")
    if env_path:
        return env_path

    variant = resolve_catalog_variant()
    variant_path = _CATALOG_VARIANT_DB_PATHS[variant]
    if variant != DEFAULT_CATALOG_VARIANT:
        return str(variant_path)

    for candidate in _DEFAULT_DB_CANDIDATES:
        if candidate.exists():
            return str(candidate)
    return str(variant_path)


def resolve_catalog_limit() -> int:
    """Max number of movies loaded into the active catalog cache. 0 means no cap."""
    raw = (os.environ.get("CATALOG_MAX_MOVIES") or "").strip()
    if not raw:
        return DEFAULT_CATALOG_MAX_MOVIES
    try:
        limit = int(raw)
    except Exception:
        return DEFAULT_CATALOG_MAX_MOVIES
    return limit if limit >= 0 else DEFAULT_CATALOG_MAX_MOVIES

def _connect() -> sqlite3.Connection:
    db_path = resolve_db_path()
    if not os.path.exists(db_path):
        raise FileNotFoundError(f"Catalog DB not found at: {db_path}")
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    return conn


def _as_float(v: Any, default: float = 0.0) -> float:
    try:
        return float(v)
    except Exception:
        return default


def _json_load(v: Any, default: Any) -> Any:
    if v is None:
        return default
    if isinstance(v, (dict, list)):
        return v
    try:
        return json.loads(v)
    except Exception:
        return default


def _json_list(v: Any) -> List[str]:
    raw = _json_load(v, [])
    if not isinstance(raw, list):
        return []
    out: List[str] = []
    for item in raw:
        if item is None:
            continue
        s = str(item).strip()
        if s:
            out.append(s)
    return out


def _json_obj(v: Any) -> Dict[str, Any]:
    raw = _json_load(v, {})
    return raw if isinstance(raw, dict) else {}


def _cosine(a: List[float], b: List[float]) -> float:
    num = sum(x * y for x, y in zip(a, b))
    da = math.sqrt(sum(x * x for x in a)) or 1e-9
    db = math.sqrt(sum(y * y for y in b)) or 1e-9
    return num / (da * db)


def _centered_cosine01(a: List[float], b: List[float]) -> float:
    """Cosine on centered [0,1] vectors, mapped to [0,1]."""
    ac = [float(x) - 0.5 for x in a]
    bc = [float(y) - 0.5 for y in b]
    raw = _cosine(ac, bc)
    if not math.isfinite(raw):
        return 0.5
    return max(0.0, min(1.0, 0.5 * (raw + 1.0)))


def _safe_trait_map(raw: Any) -> Dict[str, float]:
    obj = _json_obj(raw)
    clean: Dict[str, float] = {}
    for k in TRAITS:
        clean[k] = max(0.0, min(1.0, _as_float(obj.get(k, 0.0), 0.0)))
    return clean


def _build_doc(rec: Dict[str, Any]) -> str:
    parts = [
        rec.get("title", ""),
        rec.get("synopsis", ""),
        " ".join(rec.get("genre", [])),
        " ".join(rec.get("keywords", [])),
        rec.get("director", ""),
    ]
    return " ".join(p for p in parts if p).strip()


def _rebuild_cache_if_needed() -> None:
    db_path = resolve_db_path()
    if not os.path.exists(db_path):
        raise FileNotFoundError(f"Catalog DB not found at: {db_path}")

    mtime = os.path.getmtime(db_path)
    max_movies = resolve_catalog_limit()
    if (
        _CACHE["db_path"] == db_path
        and _CACHE["mtime"] == mtime
        and _CACHE["max_movies"] == max_movies
    ):
        return

    with closing(_connect()) as conn:
        cur = conn.cursor()
        query = """
            SELECT tmdb_id, title, year, overview, poster_url, genres, keywords, director,
                   vote_average, vote_count, popularity, providers, traits
            FROM movies
            ORDER BY popularity DESC, vote_count DESC
        """
        params: tuple[Any, ...] = ()
        if max_movies > 0:
            query += "\nLIMIT ?"
            params = (max_movies,)
        cur.execute(query, params)
        rows = cur.fetchall()

    records: List[Dict[str, Any]] = []
    docs: List[str] = []

    for idx, r in enumerate(rows):
        traits = _safe_trait_map(r["traits"])
        genres = _json_list(r["genres"])
        keywords = _json_list(r["keywords"])
        providers = _json_obj(r["providers"])

        rec = {
            "_idx": idx,
            "id": r["tmdb_id"],
            "title": r["title"],
            "year": r["year"],
            "posterUrl": r["poster_url"],
            "synopsis": r["overview"],
            "traits": traits,
            "genre": genres,
            "keywords": keywords,
            "director": r["director"],
            "rating": "NR",
            "rating_source": "TMDB",
            "where_to_watch": providers.get("US", []),
            "providers": providers,
            "vote_average": _as_float(r["vote_average"], 0.0),
            "vote_count": int(_as_float(r["vote_count"], 0.0)),
            "popularity": _as_float(r["popularity"], 0.0),
        }
        rec["doc"] = _build_doc(rec)
        docs.append(rec["doc"] or rec["title"] or "movie")
        records.append(rec)

    if docs:
        vectorizer = TfidfVectorizer(max_features=20000, ngram_range=(1, 2), stop_words="english")
        matrix = vectorizer.fit_transform(docs)
    else:
        vectorizer = None
        matrix = None

    _CACHE["db_path"] = db_path
    _CACHE["mtime"] = mtime
    _CACHE["max_movies"] = max_movies
    _CACHE["records"] = records
    _CACHE["tfidf_vectorizer"] = vectorizer
    _CACHE["tfidf_matrix"] = matrix


def _top_traits(traits: Dict[str, float], n: int = 3) -> List[str]:
    ordered = sorted(TRAITS, key=lambda k: float(traits.get(k, 0.0)), reverse=True)
    return ordered[:n]


def _derive_query_text(
    user_traits: Dict[str, float],
    personality_traits: Dict[str, float] | None = None,
    mood_traits: Dict[str, float] | None = None,
) -> str:
    terms: List[str] = []

    for k in _top_traits(user_traits, n=3):
        terms.extend(_TRAIT_QUERY_HINTS.get(k, [k])[:3])

    if personality_traits:
        for k in _top_traits(personality_traits, n=2):
            terms.extend(_TRAIT_QUERY_HINTS.get(k, [k])[:2])

    if mood_traits:
        for k in _top_traits(mood_traits, n=2):
            terms.extend(_TRAIT_QUERY_HINTS.get(k, [k])[:2])

    return " ".join(terms).strip()


def count_rows() -> int:
    """Return the number of movies in the active (possibly limited) catalog."""
    _rebuild_cache_if_needed()
    return len(_CACHE["records"])


def count_total_rows() -> int:
    """Return the total number of movies present in the DB table."""
    with closing(_connect()) as conn:
        cur = conn.cursor()
        cur.execute("SELECT COUNT(*) FROM movies")
        row = cur.fetchone()
    return int(row[0]) if row else 0


def hybrid_candidates(
    user_traits: Dict[str, float],
    limit: int = 80,
    prefilter: int = 3000,
    query_text: str | None = None,
    personality_traits: Dict[str, float] | None = None,
    mood_traits: Dict[str, float] | None = None,
    trait_pool: int = 800,
    text_pool: int = 800,
    trait_weight: float = 0.78,
    text_weight: float = 0.22,
) -> List[Dict[str, Any]]:
    """Hybrid retrieval from trait-space + text-space, then weighted fusion."""
    _rebuild_cache_if_needed()

    records: List[Dict[str, Any]] = _CACHE["records"]
    if not records:
        return []

    # Score the full active catalog to avoid popularity-sliced recall loss.
    pool = records

    uvec = [float(user_traits.get(k, 0.5)) for k in TRAITS]

    trait_scores: Dict[int, float] = {}
    for rec in pool:
        mvec = [float(rec["traits"].get(k, 0.5)) for k in TRAITS]
        score = _centered_cosine01(uvec, mvec)
        trait_scores[int(rec["_idx"])] = score

    trait_ranked = sorted(
        trait_scores.items(),
        key=lambda x: x[1],
        reverse=True,
    )
    trait_top = dict(trait_ranked[: max(limit, trait_pool)])

    text_scores: Dict[int, float] = {}
    vectorizer = _CACHE["tfidf_vectorizer"]
    matrix = _CACHE["tfidf_matrix"]

    if vectorizer is not None and matrix is not None:
        q = (query_text or "").strip()
        if not q:
            q = _derive_query_text(
                user_traits,
                personality_traits=personality_traits,
                mood_traits=mood_traits,
            )
        if q:
            pool_idx = np.array([int(rec["_idx"]) for rec in pool], dtype=np.int32)
            qv = vectorizer.transform([q])
            sims = linear_kernel(qv, matrix[pool_idx]).ravel()
            order = np.argsort(sims)[::-1][: max(limit, text_pool)]
            for j in order:
                gidx = int(pool_idx[int(j)])
                text_scores[gidx] = float(sims[int(j)])

    selected_ids = set(trait_top.keys()) | set(text_scores.keys())
    if not selected_ids:
        selected_ids = {int(rec["_idx"]) for rec in pool[:limit]}

    tw = max(0.0, float(trait_weight))
    xw = max(0.0, float(text_weight))
    denom = tw + xw or 1.0
    tw /= denom
    xw /= denom

    out: List[Dict[str, Any]] = []
    for idx in selected_ids:
        rec = records[idx]
        trait_s = float(trait_top.get(idx, 0.0))
        text_s = float(text_scores.get(idx, 0.0))
        fused = tw * trait_s + xw * text_s

        out.append(
            {
                "id": rec["id"],
                "title": rec["title"],
                "year": rec["year"],
                "posterUrl": rec["posterUrl"],
                "synopsis": rec["synopsis"],
                "traits": rec["traits"],
                "match": round(fused, 4),
                "trait_score": round(trait_s, 6),
                "text_score": round(text_s, 6),
                "genre": rec["genre"],
                "director": rec["director"],
                "rating": rec["rating"],
                "rating_source": rec.get("rating_source", "TMDB"),
                "where_to_watch": rec["where_to_watch"],
                "providers": rec["providers"],
                "popularity": rec["popularity"],
                "vote_average": rec["vote_average"],
                "vote_count": rec["vote_count"],
            }
        )

    out.sort(
        key=lambda m: (
            -float(m.get("match", 0.0)),
            -float(m.get("trait_score", 0.0)),
            -float(m.get("text_score", 0.0)),
            str(m.get("title", "")).lower(),
        )
    )
    return out[:limit]


def top_matches(
    user_traits: Dict[str, float],
    limit: int = 6,
    prefilter: int = 200,
    include_scores: bool = False,
    query_text: str | None = None,
    personality_traits: Dict[str, float] | None = None,
    mood_traits: Dict[str, float] | None = None,
) -> List[Dict[str, Any]]:
    """
    Backward-compatible entrypoint used by the Flask app.

    include_scores is a compatibility argument retained for older callers.
    """
    del include_scores
    return hybrid_candidates(
        user_traits=user_traits,
        limit=limit,
        prefilter=prefilter,
        query_text=query_text,
        personality_traits=personality_traits,
        mood_traits=mood_traits,
    )
