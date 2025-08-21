from flask import Blueprint, request, jsonify
from pathlib import Path
import json, os, math, time, random
from typing import Dict, List, Any, Iterable, Set, Tuple

from .traits import answers_to_traits, summarize_traits
from .recommenders import hybrid_score  # kept for compatibility (not used here)
from .retrieval import Retriever, traits_to_prompt  # kept for compatibility
from .bandit import LinUCB, features
from .db import init_db, SessionLocal, Event
from .tmdb import enrich_movie_by_title_year

# Big catalog search (SQLite)
from app.catalog_db import top_matches  # expects MOVIES_DB env var to point to the .db

bp = Blueprint("main", __name__)

MOVIES: List[Dict[str, Any]] = []
RETRIEVER = None
LINUCB = LinUCB(d=27, alpha=0.6)

MOVIE_PATH = Path(__file__).parent / "datasets" / "movies.json"


def init_app(app):
    """Initialize bandit DB and tiny JSON fallback index used by Retriever (still loaded)."""
    global MOVIES, RETRIEVER
    init_db()
    try:
        with open(MOVIE_PATH, "r", encoding="utf-8") as f:
            MOVIES = json.load(f)
    except Exception:
        MOVIES = []
    RETRIEVER = Retriever(MOVIES) if MOVIES else None


@bp.get("/health")
def health():
    # Optional: expose whether the big catalog exists
    db_path = os.environ.get("MOVIES_DB", "/app/app/datasets/movies.db")
    ok = os.path.exists(db_path)
    import_error = None
    rows = None
    try:
        # catalog_db.health() may exist; otherwise ignore
        from app.catalog_db import count_rows
        rows = count_rows()  # returns int
    except Exception as e:
        import_error = str(e) if not ok else None
    return {
        "status": "ok",
        "catalog_import_ok": bool(ok),
        "catalog_import_error": import_error,
        "catalog_rows": rows,
        "db_path": db_path.replace("\\", "/"),
    }


# -------------------------- RERANKING / DIVERSITY HELPERS --------------------------

def _vec_from_movie(m: Dict[str, Any]) -> List[float]:
    """Return the 9-trait vector from a movie dict (robust to schema)."""
    t = m.get("traits") or m.get("vector") or {}
    if isinstance(t, list):  # already list
        v = t
    else:
        # ensure fixed order aligned with your 9 traits
        order = ["energy","mood","depth","optimism","novelty","comfort","intensity","humor","darkness"]
        v = [float(t.get(k, 0.5)) for k in order]
    # clamp to [0,1]
    return [0.0 if x < 0 else 1.0 if x > 1 else float(x) for x in v]


def _vec_from_user(traits: Dict[str, float]) -> List[float]:
    order = ["energy","mood","depth","optimism","novelty","comfort","intensity","humor","darkness"]
    return [float(traits.get(k, 0.5)) for k in order]


def _cosine(a: List[float], b: List[float]) -> float:
    num = sum(x*y for x, y in zip(a, b))
    da = math.sqrt(sum(x*x for x in a)) or 1e-9
    db = math.sqrt(sum(y*y for y in b)) or 1e-9
    return num / (da * db)


def _dedupe(cands: Iterable[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Remove duplicates by tmdb_id and by (title_lower, year)."""
    seen_ids: Set[Any] = set()
    seen_keys: Set[Tuple[str, Any]] = set()
    out = []
    for m in cands:
        key_id = m.get("tmdb_id") or m.get("id")
        key_ty = (str(m.get("title","")).strip().lower(), m.get("year"))
        if key_id in seen_ids or key_ty in seen_keys:
            continue
        seen_ids.add(key_id)
        seen_keys.add(key_ty)
        out.append(m)
    return out


def _get_recently_seen_ids(session_id: str, lookback_days: int = 14) -> Set[str]:
    """Gather movie_ids the session has recently been shown/interacted with."""
    cutoff = time.time() - lookback_days * 86400
    dbs = SessionLocal()
    try:
        q = (
            dbs.query(Event)
            .filter(Event.session_id == session_id)
            .filter(Event.ts >= cutoff)  # ts in seconds since epoch; adjust if your model differs
        )
        ids = {str(e.movie_id) for e in q.all() if e.movie_id}
        return ids
    except Exception:
        return set()
    finally:
        dbs.close()


def _mmr_diversify(
    cands: List[Dict[str, Any]],
    user_traits: Dict[str, float],
    k: int = 6,
    lambda_: float = 0.70,
    seen_ids: Set[str] | None = None,
    seen_penalty: float = 0.08,
) -> List[Dict[str, Any]]:
    """
    Maximal Marginal Relevance: pick k items maximizing a blend of
    (a) relevance to the user and (b) dissimilarity to already-chosen items.
    Also subtract a small penalty for items seen recently in this session.
    """
    if not cands:
        return []

    u = _vec_from_user(user_traits)
    # Precompute item vectors + base score (use provided match or cosine)
    enriched = []
    for m in cands:
        v = _vec_from_movie(m)
        base = float(m.get("match", _cosine(u, v)))
        # small jitter to break ties predictably yet vary slightly
        base += random.uniform(-0.002, 0.002)
        if seen_ids and str(m.get("id")) in seen_ids:
            base -= seen_penalty
        enriched.append((m, v, base))

    picked: List[Tuple[Dict[str, Any], List[float], float]] = []
    rest = enriched[:]

    while rest and len(picked) < k:
        best_idx = 0
        best_score = -1e9
        for i, (m, v, base) in enumerate(rest):
            if not picked:
                mmr = base
            else:
                # similarity to the already-picked set = max cosine
                sim = max(_cosine(v, pv) for _, pv, _ in picked)
                mmr = lambda_ * base - (1.0 - lambda_) * sim
            if mmr > best_score:
                best_score = mmr
                best_idx = i
        picked.append(rest.pop(best_idx))

    result = []
    for m, _, base in picked:
        # expose the reranked score as match (0..1-ish), clamped
        m_out = dict(m)
        m_out["match"] = round(max(0.0, min(1.0, base)), 4)
        result.append(m_out)
    return result
# -------------------------------------------------------------------------------


@bp.post("/recommend")
def recommend():
    data = request.get_json(silent=True) or {}
    answers = data.get("answers")

    # same validation as before
    if not isinstance(answers, list) or len(answers) != 9:
        return jsonify({"error": "expected 'answers' as 9-length array"}), 400

    session_id = data.get("session_id") or request.headers.get("X-Session-ID") or "anon"

    # 1) derive the user's 9-trait vector + summary
    user_traits = answers_to_traits(answers)
    profile_summary = summarize_traits(user_traits)

    # 2) ensure the large catalog exists (no fallback)
    db_path = os.environ.get("MOVIES_DB", "/app/app/datasets/movies.db")
    if not os.path.exists(db_path):
        return jsonify({"error": "Catalog not ready. Run the TMDb ingest to create movies.db."}), 503

    # 3) fetch a generous candidate set from the big catalog
    #    (increase prefilter if you ingest far more rows)
    try:
        raw_cands = top_matches(
            user_traits,
            limit=80,            # get a wider pool to diversify from
            prefilter=3000,      # widen the SQL first-pass
            include_scores=True  # if supported: keep base 'match' on items
        )
    except TypeError:
        # older top_matches signature
        raw_cands = top_matches(user_traits, limit=80, prefilter=3000)

    # 4) clean + diversify + novelty penalty
    deduped = _dedupe(raw_cands)
    seen = _get_recently_seen_ids(session_id, lookback_days=21)
    reranked = _mmr_diversify(
        deduped,
        user_traits=user_traits,
        k=6,
        lambda_=0.72,      # 0.7–0.8 is a nice balance; higher = prioritize relevance
        seen_ids=seen,
        seen_penalty=0.10  # nudge repeats down
    )

    # 5) (optional) fill in posters if missing
    enriched = []
    for m in reranked:
        if not m.get("posterUrl"):
            try:
                m = enrich_movie_by_title_year(m)
            except Exception:
                pass
        enriched.append(m)

    # 6) record "shown" events for bandit / history
    try:
        dbs = SessionLocal()
        now = time.time()
        for m in enriched:
            mid = str(m.get("id"))
            ev = Event(session_id=session_id, movie_id=mid, type="shown", reward=0.0, ts=now, features={"user_traits": user_traits, "movie_traits": m.get("traits", {})})
            dbs.add(ev)
        dbs.commit()
        dbs.close()
    except Exception:
        pass

    return jsonify({
        "profile": {"traits": user_traits, "summary": profile_summary},
        "recommendations": enriched,
        "algo_used": "tmdb_cosine_mmr_v2",
        "session_id": session_id
    })


@bp.post("/event")
def event():
    data = request.get_json(silent=True) or {}
    session_id = data.get("session_id") or request.headers.get("X-Session-ID") or "anon"
    movie_id = data.get("movie_id"); etype = data.get("type")
    feats = data.get("features") or {}
    reward_map = {"click": 0.2, "save": 0.6, "finish": 1.0, "dismiss": -0.2}
    reward = float(data.get("reward", reward_map.get(etype, 0.0)))

    if not movie_id:
        return jsonify({"error": "movie_id required"}), 400

    dbs = SessionLocal()
    try:
        ev = Event(session_id=session_id, movie_id=str(movie_id), type=etype, reward=reward, features=feats)
        dbs.add(ev); dbs.commit()

        # Optional LinUCB online update
        try:
            user = feats.get("user_traits"); movie = feats.get("movie_traits")
            if user and movie:
                import numpy as np
                x = features(user, movie)
                LINUCB.update(dbs, str(movie_id), x, reward)
        except Exception:
            pass
    finally:
        dbs.close()

    return {"ok": True}
