from collections import defaultdict
from datetime import datetime, timezone, timedelta
from pathlib import Path
import hashlib
from functools import cmp_to_key
import json
import math
import os
import random
import re
from typing import Any, Dict, Iterable, List, Set, Tuple

from flask import Blueprint, jsonify, request

from .traits import answers_to_traits, summarize_traits
from .bandit import LinUCB, features
from .db import Event, SessionLocal, init_db
from .tmdb import enrich_movie_by_title_year
from app.catalog_db import (
    count_rows,
    count_total_rows,
    resolve_active_catalog_variant,
    resolve_catalog_limit,
    resolve_db_path,
    top_matches,
)

bp = Blueprint("main", __name__)

MOVIES: List[Dict[str, Any]] = []
RETRIEVER = None
LINUCB = LinUCB(d=27, alpha=0.6)

MOVIE_PATH = Path(__file__).parent / "datasets" / "movies.json"
TRAIT_ORDER = ["energy", "mood", "depth", "optimism", "novelty", "comfort", "intensity", "humor", "darkness"]
INTERACTION_TYPES = {"click", "save", "finish", "dismiss"}
ALGO_TAG = "hybrid_centered_cosine_text_feedback_mmr_v7_relevance_floor_freshness_overlap_guard"


def _safe_float(v: Any, default: float = 0.0) -> float:
    try:
        return float(v)
    except Exception:
        return default


def _clamp01(v: float) -> float:
    return 0.0 if v < 0.0 else 1.0 if v > 1.0 else float(v)

def _safe_int(v: Any, default: int = 0) -> int:
    try:
        return int(v)
    except Exception:
        return default


def _normalize_movie_ids(raw: Any, limit: int = 48) -> List[str]:
    if not isinstance(raw, list):
        return []
    seen: Set[str] = set()
    out: List[str] = []
    for item in raw:
        mid = str(item or "").strip()
        if not mid or mid in seen:
            continue
        seen.add(mid)
        out.append(mid)
        if len(out) >= limit:
            break
    return out



def _env_float(name: str, default: float) -> float:
    raw = os.environ.get(name)
    if raw is None:
        return default
    try:
        return float(raw)
    except Exception:
        return default


def _env_int(name: str, default: int) -> int:
    raw = os.environ.get(name)
    if raw is None:
        return default
    try:
        return int(raw)
    except Exception:
        return default


POPULARITY_BIAS_MAX = max(0.0, _env_float("MM_POPULARITY_BIAS_MAX", 0.006))
RERANK_BAND_MULT = max(1.2, _env_float("MM_RERANK_BAND_MULT", 2.4))
RERANK_EXPLORE_MIN = _clamp01(_env_float("MM_RERANK_EXPLORE_MIN", 0.06))
RERANK_EXPLORE_MAX = _clamp01(_env_float("MM_RERANK_EXPLORE_MAX", 0.32))
MAX_PER_PRIMARY_GENRE = max(1, _env_int("MM_MAX_PER_PRIMARY_GENRE", 2))
MAX_PER_FRANCHISE = max(1, _env_int("MM_MAX_PER_FRANCHISE", 1))
RESULT_COUNT = max(2, min(10, _env_int("MM_RESULT_COUNT", 4)))
CANDIDATE_LIMIT_MIN = max(40, _env_int("MM_CANDIDATE_LIMIT_MIN", 40))
CANDIDATE_LIMIT_MAX = max(CANDIDATE_LIMIT_MIN, _env_int("MM_CANDIDATE_LIMIT_MAX", 140))
CANDIDATE_LIMIT_RATIO = max(0.0, _env_float("MM_CANDIDATE_LIMIT_RATIO", 0.30))
RERANK_POOL_MIN = max(RESULT_COUNT * 8, _env_int("MM_RERANK_POOL_MIN", RESULT_COUNT * 8))
RERANK_POOL_MAX = max(RERANK_POOL_MIN, _env_int("MM_RERANK_POOL_MAX", 96))
RERANK_POOL_RATIO = max(0.0, _env_float("MM_RERANK_POOL_RATIO", 0.72))
FINAL_TIEBREAK_RANK_EPS = max(0.0, _env_float("MM_FINAL_TIEBREAK_RANK_EPS", 0.01))
FINAL_TIEBREAK_FIT_EPS = max(0.0, _env_float("MM_FINAL_TIEBREAK_FIT_EPS", 0.015))
RELEVANCE_FLOOR_ABS = _clamp01(_env_float("MM_RELEVANCE_FLOOR_ABS", 0.72))
RELEVANCE_FLOOR_REL = max(0.0, _env_float("MM_RELEVANCE_FLOOR_REL", 0.08))
GLOBAL_REPEAT_BETA = max(0.0, _env_float("MM_GLOBAL_REPEAT_BETA", 0.012))
GLOBAL_REPEAT_LOOKBACK_DAYS = max(1, _env_int("MM_GLOBAL_REPEAT_LOOKBACK_DAYS", 14))
DISSIMILAR_LOOKBACK_DAYS = max(1, _env_int("MM_DISSIMILAR_LOOKBACK_DAYS", 30))
DISSIMILAR_SIM_MAX = _clamp01(_env_float("MM_DISSIMILAR_SIM_MAX", 0.42))
DISSIMILAR_PENALTY_BETA = max(0.0, _env_float("MM_DISSIMILAR_PENALTY_BETA", 0.009))
DISSIMILAR_MMR_PENALTY_BETA = max(0.0, _env_float("MM_DISSIMILAR_MMR_PENALTY_BETA", 0.008))
DISSIMILAR_HOT_MIN = max(1, _env_int("MM_DISSIMILAR_HOT_MIN", 5))
DISSIMILAR_OVERLAP_CAP = max(0, _env_int("MM_DISSIMILAR_OVERLAP_CAP", 2))
RELEVANCE_FLOOR_TEXT_BLEND = _clamp01(_env_float("MM_RELEVANCE_FLOOR_TEXT_BLEND", 0.18))
SHOWN_EVENT_DEDUPE_MINUTES = max(1, _env_int("MM_SHOWN_EVENT_DEDUPE_MINUTES", 30))


def init_app(app):
    """Initialize app DB and optional tiny JSON fallback index."""
    global MOVIES, RETRIEVER
    init_db()
    try:
        with open(MOVIE_PATH, "r", encoding="utf-8") as f:
            MOVIES = json.load(f)
    except Exception:
        MOVIES = []

    try:
        from .retrieval import Retriever

        RETRIEVER = Retriever(MOVIES) if MOVIES else None
    except Exception:
        RETRIEVER = None


@bp.get("/health")
def health():
    db_path = resolve_db_path()
    path_exists = os.path.exists(db_path)

    rows = None
    total_rows = None
    import_error = None
    active_limit = resolve_catalog_limit()
    if path_exists:
        try:
            rows = count_rows()
            total_rows = count_total_rows()
        except Exception as e:
            import_error = str(e)
    else:
        import_error = f"Catalog DB not found at {db_path}"

    return {
        "status": "ok",
        "catalog_import_ok": bool(path_exists and import_error is None),
        "catalog_import_error": import_error,
        "catalog_rows": rows,
        "catalog_total_rows": total_rows,
        "catalog_active_limit": active_limit,
        "catalog_variant": resolve_active_catalog_variant(db_path),
        "db_path": db_path.replace("\\", "/"),
        "algo": ALGO_TAG,
    }


def _vec_from_movie(m: Dict[str, Any]) -> List[float]:
    t = m.get("traits") or m.get("vector") or {}
    if isinstance(t, list):
        v = [float(x) for x in t]
    else:
        v = [float(t.get(k, 0.5)) for k in TRAIT_ORDER]
    return [_clamp01(x) for x in v]


def _vec_from_user(traits: Dict[str, float]) -> List[float]:
    return [_clamp01(_safe_float(traits.get(k, 0.5), 0.5)) for k in TRAIT_ORDER]


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
    return _clamp01(0.5 * (raw + 1.0))


def _dedupe(cands: Iterable[Dict[str, Any]]) -> List[Dict[str, Any]]:
    seen_ids: Set[Any] = set()
    seen_keys: Set[Tuple[str, Any]] = set()
    out: List[Dict[str, Any]] = []
    for m in cands:
        key_id = m.get("tmdb_id") or m.get("id")
        key_ty = (str(m.get("title", "")).strip().lower(), m.get("year"))
        if key_id in seen_ids or key_ty in seen_keys:
            continue
        seen_ids.add(key_id)
        seen_keys.add(key_ty)
        out.append(m)
    return out


def _title_root(title: str) -> str:
    toks = re.findall(r"[a-z0-9]+", (title or "").lower())
    stop = {"the", "a", "an", "and", "of", "to", "part", "movie", "film"}
    toks = [t for t in toks if t not in stop]
    return " ".join(toks[:2]) if toks else ""


def _primary_genre(movie: Dict[str, Any]) -> str:
    g = movie.get("genre")
    if isinstance(g, list) and g:
        return str(g[0]).strip().lower()
    if isinstance(g, str):
        return g.strip().lower()
    return ""


def _get_recently_seen_ids(session_id: str, lookback_days: int = 14) -> Set[str]:
    cutoff_dt = datetime.now(timezone.utc) - timedelta(days=lookback_days)
    dbs = SessionLocal()
    try:
        q = dbs.query(Event).filter(Event.session_id == session_id)
        q = q.filter(Event.ts >= cutoff_dt)
        q = q.filter(Event.type.in_(tuple(INTERACTION_TYPES)))
        return {str(e.movie_id) for e in q.all() if e.movie_id}
    except Exception:
        return set()
    finally:
        dbs.close()


def _get_feedback_priors(movie_ids: List[str], lookback_days: int = 180) -> Dict[str, float]:
    if not movie_ids:
        return {}
    ids = [str(x) for x in movie_ids if x is not None]
    if not ids:
        return {}

    cutoff_dt = datetime.now(timezone.utc) - timedelta(days=lookback_days)
    sums = defaultdict(float)
    counts = defaultdict(int)

    dbs = SessionLocal()
    try:
        rows = (
            dbs.query(Event)
            .filter(Event.movie_id.in_(ids))
            .filter(Event.ts >= cutoff_dt)
            .filter(Event.type.in_(tuple(INTERACTION_TYPES)))
            .all()
        )
        for e in rows:
            mid = str(e.movie_id)
            sums[mid] += _safe_float(e.reward, 0.0)
            counts[mid] += 1
    except Exception:
        return {mid: 0.5 for mid in ids}
    finally:
        dbs.close()

    prior_mean = 0.1
    prior_strength = 5.0
    priors: Dict[str, float] = {}
    for mid in ids:
        c = counts[mid]
        s = sums[mid]
        posterior = (s + prior_mean * prior_strength) / (c + prior_strength)
        # reward range approx [-0.2, 1.0] -> [0,1]
        priors[mid] = _clamp01((posterior + 0.2) / 1.2)
    return priors


def _get_session_adjustments(session_id: str, lookback_days: int = 45) -> Dict[str, float]:
    cutoff_dt = datetime.now(timezone.utc) - timedelta(days=lookback_days)
    dbs = SessionLocal()
    out = defaultdict(float)
    try:
        rows = (
            dbs.query(Event)
            .filter(Event.session_id == session_id)
            .filter(Event.ts >= cutoff_dt)
            .filter(Event.type.in_(tuple(INTERACTION_TYPES)))
            .all()
        )
        for e in rows:
            mid = str(e.movie_id)
            etype = str(e.type or "")
            if etype == "dismiss":
                out[mid] -= 0.12
            elif etype == "click":
                out[mid] += 0.02
            elif etype == "save":
                out[mid] += 0.07
            elif etype == "finish":
                out[mid] += 0.10
    except Exception:
        return {}
    finally:
        dbs.close()

    return {mid: max(-0.20, min(0.20, adj)) for mid, adj in out.items()}


def _get_global_shown_counts(
    movie_ids: List[str],
    lookback_days: int = 14,
    exclude_session_id: str | None = None,
) -> Dict[str, int]:
    ids = [str(x) for x in movie_ids if x is not None]
    if not ids:
        return {}

    cutoff_dt = datetime.now(timezone.utc) - timedelta(days=lookback_days)
    out: Dict[str, int] = defaultdict(int)
    dbs = SessionLocal()
    try:
        rows = (
            dbs.query(Event)
            .filter(Event.movie_id.in_(ids))
            .filter(Event.ts >= cutoff_dt)
            .filter(Event.type == "shown")
        )
        if exclude_session_id:
            rows = rows.filter(Event.session_id != exclude_session_id)
        rows = rows.all()
        for e in rows:
            out[str(e.movie_id)] += 1
    except Exception:
        return {}
    finally:
        dbs.close()

    return out


def _get_recently_logged_shown_ids(
    session_id: str,
    movie_ids: List[str],
    lookback_minutes: int = 30,
) -> Set[str]:
    ids = [str(x) for x in movie_ids if x is not None]
    if not session_id or not ids:
        return set()

    cutoff_dt = datetime.now(timezone.utc) - timedelta(minutes=lookback_minutes)
    dbs = SessionLocal()
    try:
        rows = (
            dbs.query(Event)
            .filter(Event.session_id == session_id)
            .filter(Event.movie_id.in_(ids))
            .filter(Event.ts >= cutoff_dt)
            .filter(Event.type == "shown")
            .all()
        )
        return {str(e.movie_id) for e in rows if e.movie_id}
    except Exception:
        return set()
    finally:
        dbs.close()

def _extract_trait_vec(raw: Any) -> List[float] | None:
    if not isinstance(raw, dict):
        return None
    return [_clamp01(_safe_float(raw.get(k, 0.5), 0.5)) for k in TRAIT_ORDER]


def _get_dissimilar_exposure_counts(
    movie_ids: List[str],
    user_traits: Dict[str, float],
    lookback_days: int = 30,
    sim_max: float = 0.42,
) -> Dict[str, int]:
    ids = [str(x) for x in movie_ids if x is not None]
    if not ids:
        return {}

    cutoff_dt = datetime.now(timezone.utc) - timedelta(days=lookback_days)
    by_session_movies: Dict[str, Set[str]] = defaultdict(set)
    by_session_traits: Dict[str, List[float]] = {}
    dbs = SessionLocal()

    try:
        rows = (
            dbs.query(Event)
            .filter(Event.movie_id.in_(ids))
            .filter(Event.ts >= cutoff_dt)
            .filter(Event.type == "shown")
            .all()
        )
        for e in rows:
            sid = str(e.session_id or "")
            if not sid:
                continue
            mid = str(e.movie_id)
            by_session_movies[sid].add(mid)

            if sid in by_session_traits:
                continue
            feats = e.features if isinstance(e.features, dict) else {}
            vec = _extract_trait_vec(feats.get("user_traits"))
            if vec is not None:
                by_session_traits[sid] = vec
    except Exception:
        return {}
    finally:
        dbs.close()

    target = _vec_from_user(user_traits)
    out: Dict[str, int] = defaultdict(int)
    for sid, mids in by_session_movies.items():
        other = by_session_traits.get(sid)
        if other is None:
            continue
        sim = _centered_cosine01(target, other)
        if sim > sim_max:
            continue
        for mid in mids:
            out[mid] += 1

    return out

def _blend_weights(overall_conf: float) -> Dict[str, float]:
    conf = _clamp01(overall_conf)
    trait_w = 0.68 + 0.22 * conf
    text_w = 0.24 - 0.10 * conf
    feedback_w = 0.08
    total = trait_w + text_w + feedback_w
    return {
        "trait": trait_w / total,
        "text": text_w / total,
        "feedback": feedback_w / total,
    }


def _rank_score(
    m: Dict[str, Any],
    user_traits: Dict[str, float],
    overall_conf: float,
    feedback_score: float,
    session_adjustment: float,
    weights: Dict[str, float],
) -> float:
    trait_score = _safe_float(m.get("trait_score", m.get("match", 0.0)), 0.0)
    text_score = _safe_float(m.get("text_score", 0.0), 0.0)

    base = (
        weights["trait"] * trait_score
        + weights["text"] * text_score
        + weights["feedback"] * _clamp01(feedback_score)
    )

    mt = m.get("traits") or {}
    user_novelty = _clamp01(_safe_float(user_traits.get("novelty", 0.5), 0.5))
    user_comfort = _clamp01(_safe_float(user_traits.get("comfort", 0.5), 0.5))
    movie_novelty = _clamp01(_safe_float(mt.get("novelty", 0.5), 0.5))
    movie_comfort = _clamp01(_safe_float(mt.get("comfort", 0.5), 0.5))

    pop_norm = min(1.0, _safe_float(m.get("popularity", 0.0), 0.0) / 300.0)
    vote_count = max(0.0, _safe_float(m.get("vote_count", 0.0), 0.0))
    vote_count_norm = min(1.0, math.log1p(vote_count) / math.log(5000.0))

    # Keep a small mainstream prior, but avoid drowning out personal taste.
    popularity_bias = POPULARITY_BIAS_MAX * (0.45 + 0.55 * user_comfort) * (0.55 * pop_norm + 0.45 * vote_count_norm)
    discovery_bonus = 0.025 * user_novelty * (1.0 - pop_norm)
    novelty_bonus = 0.045 * user_novelty * movie_novelty * (0.5 + 0.5 * _clamp01(overall_conf))
    comfort_bonus = 0.028 * user_comfort * movie_comfort

    return base + popularity_bias + discovery_bonus + novelty_bonus + comfort_bonus + session_adjustment


def _adaptive_lambda(user_traits: Dict[str, float], overall_conf: float, seen_count: int) -> float:
    novelty = _clamp01(_safe_float(user_traits.get("novelty", 0.5), 0.5))
    conf = _clamp01(overall_conf)
    lam = 0.84 - 0.34 * novelty + 0.06 * (1.0 - conf)
    lam -= min(seen_count, 15) * 0.004
    return max(0.45, min(0.88, lam))


def _stable_rng(
    session_id: str,
    user_traits: Dict[str, float],
    overall_conf: float,
    variant_seed: str = "",
) -> random.Random:
    payload = {
        "session_id": str(session_id or "anon"),
        "confidence": round(_clamp01(overall_conf), 4),
        "traits": {k: round(_clamp01(_safe_float(user_traits.get(k, 0.5), 0.5)), 4) for k in TRAIT_ORDER},
        "variant_seed": str(variant_seed or ""),
    }
    raw = json.dumps(payload, sort_keys=True).encode("utf-8")
    seed = int(hashlib.sha256(raw).hexdigest()[:16], 16)
    return random.Random(seed)


def _sample_rerank_pool(
    scored: List[Dict[str, Any]],
    pool_size: int,
    user_traits: Dict[str, float],
    overall_conf: float,
    rng: random.Random,
    explore_scale: float = 1.0,
) -> Tuple[List[Dict[str, Any]], float, int]:
    if not scored or pool_size <= 0:
        return [], 0.0, 0

    if len(scored) <= pool_size:
        return scored[:pool_size], 0.0, len(scored)

    novelty = _clamp01(_safe_float(user_traits.get("novelty", 0.5), 0.5))
    conf = _clamp01(overall_conf)
    explore_ratio = _clamp01(
        RERANK_EXPLORE_MIN + (RERANK_EXPLORE_MAX - RERANK_EXPLORE_MIN) * (0.65 * novelty + 0.35 * (1.0 - conf))
    )
    explore_ratio = _clamp01(explore_ratio * max(0.0, float(explore_scale)))

    band_mult = max(1.2, RERANK_BAND_MULT + 0.8 * explore_ratio)
    band_size = max(pool_size, min(len(scored), int(round(pool_size * band_mult))))
    band = scored[:band_size]

    if explore_ratio <= 1e-6:
        return band[:pool_size], explore_ratio, band_size

    top_score = _safe_float(band[0].get("rank_score", band[0].get("match", 0.0)), 0.0)
    temperature = 0.02 + 0.06 * explore_ratio

    remaining = list(range(len(band)))
    picked_idx: List[int] = []

    while remaining and len(picked_idx) < pool_size:
        weights: List[float] = []
        for idx in remaining:
            item = band[idx]
            score = _safe_float(item.get("rank_score", item.get("match", 0.0)), 0.0)
            delta = max(0.0, top_score - score)
            w_score = math.exp(-delta / max(1e-6, temperature))
            w_rank = 1.0 / (1.0 + idx)
            w = (1.0 - explore_ratio) * w_rank + explore_ratio * w_score
            weights.append(max(1e-9, w))

        total = sum(weights)
        draw = rng.random() * total
        cum = 0.0
        chosen_local = 0
        for j, w in enumerate(weights):
            cum += w
            if draw <= cum:
                chosen_local = j
                break

        picked_global = remaining.pop(chosen_local)
        picked_idx.append(picked_global)

    picked = [band[i] for i in picked_idx]
    picked.sort(key=cmp_to_key(_final_rank_cmp))
    return picked, explore_ratio, band_size


def _movie_relevance_score(m: Dict[str, Any]) -> float:
    trait_score = _clamp01(_safe_float(m.get("trait_score", m.get("match", 0.0)), 0.0))
    text_score = _clamp01(_safe_float(m.get("text_score", 0.0), 0.0))
    blended = (1.0 - RELEVANCE_FLOOR_TEXT_BLEND) * trait_score + RELEVANCE_FLOOR_TEXT_BLEND * text_score
    return max(trait_score, _clamp01(blended))


def _popularity_tiebreak_value(m: Dict[str, Any]) -> Tuple[float, float]:
    return (
        _safe_float(m.get("popularity", 0.0), 0.0),
        max(0.0, _safe_float(m.get("vote_count", 0.0), 0.0)),
    )



def _near_tie_prefers_more_popular(left: Dict[str, Any], right: Dict[str, Any]) -> bool:
    left_rank = _safe_float(left.get("rank_score", left.get("match", 0.0)), 0.0)
    right_rank = _safe_float(right.get("rank_score", right.get("match", 0.0)), 0.0)
    left_fit = _movie_relevance_score(left)
    right_fit = _movie_relevance_score(right)

    rank_close = abs(left_rank - right_rank) <= FINAL_TIEBREAK_RANK_EPS
    fit_close = abs(left_fit - right_fit) <= FINAL_TIEBREAK_FIT_EPS
    if not (rank_close or fit_close):
        return False

    left_pop = _popularity_tiebreak_value(left)
    right_pop = _popularity_tiebreak_value(right)
    return left_pop > right_pop


def _final_rank_cmp(left: Dict[str, Any], right: Dict[str, Any]) -> int:
    if _near_tie_prefers_more_popular(left, right):
        return -1
    if _near_tie_prefers_more_popular(right, left):
        return 1

    left_rank = _safe_float(left.get("rank_score", left.get("match", 0.0)), 0.0)
    right_rank = _safe_float(right.get("rank_score", right.get("match", 0.0)), 0.0)
    if abs(left_rank - right_rank) > 1e-9:
        return -1 if left_rank > right_rank else 1

    left_fit = _movie_relevance_score(left)
    right_fit = _movie_relevance_score(right)
    if abs(left_fit - right_fit) > 1e-9:
        return -1 if left_fit > right_fit else 1

    left_title = str(left.get("title", "")).lower()
    right_title = str(right.get("title", "")).lower()
    if left_title != right_title:
        return -1 if left_title < right_title else 1

    left_id = str(left.get("id", ""))
    right_id = str(right.get("id", ""))
    if left_id != right_id:
        return -1 if left_id < right_id else 1
    return 0


def _apply_relevance_floor(scored: List[Dict[str, Any]], result_count: int) -> Tuple[List[Dict[str, Any]], float, str]:
    if not scored:
        return [], RELEVANCE_FLOOR_ABS, "none"

    top_relevance = max(_movie_relevance_score(m) for m in scored)
    floor = max(RELEVANCE_FLOOR_ABS, top_relevance - RELEVANCE_FLOOR_REL)
    filtered = [m for m in scored if _movie_relevance_score(m) >= floor]
    if len(filtered) >= result_count:
        return filtered, floor, "strict"

    # Back off minimally to avoid empty/too-small sets.
    relaxed_floor = max(0.60, top_relevance - max(0.16, RELEVANCE_FLOOR_REL * 1.9))
    filtered_relaxed = [m for m in scored if _movie_relevance_score(m) >= relaxed_floor]
    if len(filtered_relaxed) >= result_count:
        return filtered_relaxed, relaxed_floor, "relaxed"

    # Final fallback: keep a short ranked slice, preserving relevance order.
    keep_n = max(result_count * 3, result_count)
    fallback = scored[:keep_n]
    if fallback:
        relaxed_floor = min(_movie_relevance_score(m) for m in fallback)
    return fallback, relaxed_floor, "fallback"

def _apply_explicit_avoidance(
    scored: List[Dict[str, Any]],
    avoid_ids: Set[str],
    result_count: int,
) -> Tuple[List[Dict[str, Any]], int, str]:
    if not scored or not avoid_ids:
        return scored, 0, "none"

    filtered = [m for m in scored if str(m.get("id")) not in avoid_ids]
    removed = len(scored) - len(filtered)
    min_strict = max(result_count * 2, result_count + 2)
    if len(filtered) >= min_strict:
        return filtered, removed, "strict"

    penalty = 0.24
    out: List[Dict[str, Any]] = []
    for m in scored:
        m2 = dict(m)
        if str(m2.get("id")) in avoid_ids:
            rank_score = _safe_float(m2.get("rank_score", m2.get("match", 0.0)), 0.0) - penalty
            m2["rank_score"] = round(rank_score, 6)
            m2["retake_avoid_penalty"] = round(penalty, 6)
        out.append(m2)

    return out, removed, "demote"


def _mmr_diversify(
    cands: List[Dict[str, Any]],
    user_traits: Dict[str, float],
    k: int = RESULT_COUNT,
    lambda_: float = 0.70,
    seen_ids: Set[str] | None = None,
    seen_penalty: float = 0.08,
    max_per_primary_genre: int = MAX_PER_PRIMARY_GENRE,
    max_per_franchise: int = MAX_PER_FRANCHISE,
    dissimilar_counts: Dict[str, int] | None = None,
    dissimilar_hot_min: int = 3,
    dissimilar_overlap_cap: int = 1,
    dissimilar_mmr_penalty_beta: float = 0.0,
    relevance_floor: float | None = None
) -> List[Dict[str, Any]]:
    if not cands:
        return []

    u = _vec_from_user(user_traits)
    enriched: List[Tuple[Dict[str, Any], List[float], float]] = []
    for m in cands:
        v = _vec_from_movie(m)
        base = _safe_float(m.get("rank_score", m.get("match", _centered_cosine01(u, v))), 0.0)
        if seen_ids and str(m.get("id")) in seen_ids:
            base -= seen_penalty
        enriched.append((m, v, base))

    picked: List[Tuple[Dict[str, Any], List[float], float]] = []
    picked_roots: Dict[str, int] = defaultdict(int)
    picked_genres: Dict[str, int] = defaultdict(int)
    rest = enriched[:]
    strict = True
    picked_hot_overlap = 0

    while rest and len(picked) < k:
        best_idx = -1
        best_key = (-1e9, -1e9, "")
        anchor_base = picked[0][2] if picked else max((b for _, _, b in rest), default=0.0)
        lambda_eff = max(0.72, min(0.95, lambda_ + 0.08))
        min_base_allowed = anchor_base - 0.11

        for i, (m, v, base) in enumerate(rest):
            mid = str(m.get("id"))
            root = _title_root(str(m.get("title", "")))
            genre = _primary_genre(m)
            root_count = picked_roots.get(root, 0) if root else 0
            genre_count = picked_genres.get(genre, 0) if genre else 0

            franchise_block = bool(root and max_per_franchise > 0 and root_count >= max_per_franchise)
            genre_block = bool(genre and max_per_primary_genre > 0 and genre_count >= max_per_primary_genre)

            trait_score = _movie_relevance_score(m)
            relevance_block = bool(relevance_floor is not None and trait_score < relevance_floor)

            dissimilar_count = max(0, int((dissimilar_counts or {}).get(mid, 0)))
            is_dissimilar_hot = dissimilar_count >= dissimilar_hot_min
            overlap_block = bool(
                dissimilar_overlap_cap >= 0
                and is_dissimilar_hot
                and picked_hot_overlap >= dissimilar_overlap_cap
            )

            if strict and (
                franchise_block
                or genre_block
                or relevance_block
                or base < min_base_allowed
                or overlap_block
            ):
                continue

            if not picked:
                div = 1.0
            else:
                sim = max(_centered_cosine01(v, pv) for _, pv, _ in picked)
                div = 1.0 - sim

            franchise_penalty = 0.06 * root_count
            genre_penalty = 0.02 * genre_count
            dissimilar_penalty = dissimilar_mmr_penalty_beta * math.log1p(dissimilar_count)

            mmr = lambda_eff * base + (1.0 - lambda_eff) * div - franchise_penalty - genre_penalty - dissimilar_penalty
            tie_title = str(m.get("title", ""))
            key = (mmr, base, tie_title)
            if best_idx >= 0:
                best_m = rest[best_idx][0]
                best_mmr = best_key[0]
                if (
                    abs(mmr - best_mmr) <= FINAL_TIEBREAK_RANK_EPS
                    and _near_tie_prefers_more_popular(m, best_m)
                ):
                    best_key = key
                    best_idx = i
                    continue
            if key > best_key:
                best_key = key
                best_idx = i

        if best_idx < 0:
            if strict:
                strict = False
                continue
            break

        chosen = rest.pop(best_idx)
        picked.append(chosen)
        root = _title_root(str(chosen[0].get("title", "")))
        genre = _primary_genre(chosen[0])
        if root:
            picked_roots[root] += 1
        if genre:
            picked_genres[genre] += 1

        if dissimilar_counts is not None:
            chosen_mid = str(chosen[0].get("id"))
            chosen_dissimilar_count = max(0, int(dissimilar_counts.get(chosen_mid, 0)))
            if chosen_dissimilar_count >= dissimilar_hot_min:
                picked_hot_overlap += 1

        strict = True

    result = []
    for m, _, base in picked:
        m_out = dict(m)
        m_out["rank_score"] = round(base, 6)
        result.append(m_out)

    return result

def _assign_display_matches(items: List[Dict[str, Any]]) -> None:
    if not items:
        return

    for m in items:
        # Public fit should reflect absolute hybrid relevance, not relative
        # position within a diversified result set. Keep `match` as a
        # backward-compatible alias for existing clients.
        fit_score = round(_clamp01(_movie_relevance_score(m)), 4)
        m["fit_score"] = fit_score
        m["match"] = fit_score
@bp.post("/recommend")
def recommend():
    data = request.get_json(silent=True) or {}
    answers = data.get("answers")

    if not isinstance(answers, list) or len(answers) != 9:
        return jsonify({"error": "expected 'answers' as 9-length array"}), 400

    session_id = data.get("session_id") or request.headers.get("X-Session-ID") or "anon"

    context = data.get("context") if isinstance(data.get("context"), dict) else {}
    personality_traits = context.get("personality_traits") if isinstance(context.get("personality_traits"), dict) else {}
    mood_traits = context.get("mood_traits") if isinstance(context.get("mood_traits"), dict) else {}
    confidence = context.get("confidence") if isinstance(context.get("confidence"), dict) else {}
    overall_conf = _clamp01(_safe_float(confidence.get("overall", 0.75), 0.75))
    retake_round = max(0, _safe_int(context.get("retake_round"), 0))
    retake_avoid_ids = set(_normalize_movie_ids(context.get("avoid_movie_ids")))
    if retake_avoid_ids and retake_round <= 0:
        retake_round = 1

    user_traits = answers_to_traits(answers)
    profile_summary = summarize_traits(user_traits)

    db_path = resolve_db_path()
    if not os.path.exists(db_path):
        return jsonify({"error": f"Catalog not ready. Expected DB at: {db_path}"}), 503

    active_rows = max(1, count_rows())
    result_count = RESULT_COUNT
    candidate_limit = max(CANDIDATE_LIMIT_MIN, min(CANDIDATE_LIMIT_MAX, int(active_rows * CANDIDATE_LIMIT_RATIO)))
    prefilter_n = max(candidate_limit, min(active_rows, int(active_rows * 0.85)))
    rerank_pool_size = max(RERANK_POOL_MIN, min(RERANK_POOL_MAX, int(candidate_limit * RERANK_POOL_RATIO)))

    try:
        raw_cands = top_matches(
            user_traits,
            limit=candidate_limit,
            prefilter=prefilter_n,
            include_scores=True,
            query_text=context.get("query_text") if isinstance(context.get("query_text"), str) else None,
            personality_traits=personality_traits,
            mood_traits=mood_traits,
        )
    except Exception as e:
        return jsonify({"error": f"Catalog query failed: {e}"}), 503

    deduped = _dedupe(raw_cands)

    movie_ids = [str(m.get("id")) for m in deduped if m.get("id") is not None]
    feedback_priors = _get_feedback_priors(movie_ids)
    global_shown_counts = _get_global_shown_counts(
        movie_ids,
        lookback_days=GLOBAL_REPEAT_LOOKBACK_DAYS,
        exclude_session_id=session_id,
    )
    dissimilar_exposure_counts = _get_dissimilar_exposure_counts(
        movie_ids,
        user_traits=user_traits,
        lookback_days=DISSIMILAR_LOOKBACK_DAYS,
        sim_max=DISSIMILAR_SIM_MAX,
    )
    session_adjustments = _get_session_adjustments(session_id)
    weights = _blend_weights(overall_conf)

    scored: List[Dict[str, Any]] = []
    for m in deduped:
        mid = str(m.get("id"))
        shown_recent = max(0, int(global_shown_counts.get(mid, 0)))
        dissimilar_recent = max(0, int(dissimilar_exposure_counts.get(mid, 0)))
        feedback_score = feedback_priors.get(mid, 0.5)
        session_adjustment = session_adjustments.get(mid, 0.0)
        rank_score = _rank_score(
            m,
            user_traits=user_traits,
            overall_conf=overall_conf,
            feedback_score=feedback_score,
            session_adjustment=session_adjustment,
            weights=weights,
        )
        freshness_penalty = GLOBAL_REPEAT_BETA * math.log1p(shown_recent)
        dissimilar_penalty = DISSIMILAR_PENALTY_BETA * math.log1p(dissimilar_recent)
        rank_score -= freshness_penalty + dissimilar_penalty

        m2 = dict(m)
        m2["feedback_score"] = round(feedback_score, 6)
        m2["freshness_shown_lookback"] = shown_recent
        m2["dissimilar_shown_lookback"] = dissimilar_recent
        m2["freshness_penalty"] = round(freshness_penalty, 6)
        m2["dissimilar_penalty"] = round(dissimilar_penalty, 6)
        m2["session_adjustment"] = round(session_adjustment, 6)
        m2["rank_score"] = round(rank_score, 6)
        scored.append(m2)

    retake_avoid_mode = "none"
    retake_avoid_removed = 0
    if retake_avoid_ids:
        scored, retake_avoid_removed, retake_avoid_mode = _apply_explicit_avoidance(
            scored,
            avoid_ids=retake_avoid_ids,
            result_count=result_count,
        )

    scored.sort(key=cmp_to_key(_final_rank_cmp))
    scored, relevance_floor, relevance_floor_source = _apply_relevance_floor(scored, result_count=result_count)

    seen = _get_recently_seen_ids(session_id, lookback_days=21)
    adaptive_lambda = _adaptive_lambda(user_traits, overall_conf, seen_count=len(seen))
    rng = _stable_rng(session_id, user_traits, overall_conf, variant_seed=f"retake:{retake_round}" if retake_round > 0 else "")
    close_mode = result_count <= 4
    if close_mode:
        adaptive_lambda = max(0.76, min(0.94, adaptive_lambda + 0.10))
    explore_scale = 0.28 if close_mode else 0.50
    rerank_input, explore_ratio, rerank_band = _sample_rerank_pool(
        scored,
        pool_size=rerank_pool_size,
        user_traits=user_traits,
        overall_conf=overall_conf,
        rng=rng,
        explore_scale=explore_scale,
    )

    genre_cap = max(3, MAX_PER_PRIMARY_GENRE) if close_mode else MAX_PER_PRIMARY_GENRE

    reranked = _mmr_diversify(
        rerank_input,
        user_traits=user_traits,
        k=result_count,
        lambda_=adaptive_lambda,
        seen_ids=seen,
        seen_penalty=0.08 + 0.07 * (1.0 - overall_conf),
        max_per_primary_genre=genre_cap,
        max_per_franchise=MAX_PER_FRANCHISE,
        dissimilar_counts=dissimilar_exposure_counts,
        dissimilar_hot_min=DISSIMILAR_HOT_MIN,
        dissimilar_overlap_cap=DISSIMILAR_OVERLAP_CAP,
        dissimilar_mmr_penalty_beta=DISSIMILAR_MMR_PENALTY_BETA,
        relevance_floor=relevance_floor,
    )

    _assign_display_matches(reranked)

    enriched: List[Dict[str, Any]] = []
    for m in reranked:
        if not m.get("posterUrl"):
            try:
                m = enrich_movie_by_title_year(m)
            except Exception:
                pass
        enriched.append(m)

    dbs = None
    try:
        dbs = SessionLocal()
        now_dt = datetime.now(timezone.utc)
        recently_logged_shown = _get_recently_logged_shown_ids(
            session_id,
            [str(m.get("id")) for m in enriched if m.get("id") is not None],
            lookback_minutes=SHOWN_EVENT_DEDUPE_MINUTES,
        )
        for m in enriched:
            if str(m.get("id")) in recently_logged_shown:
                continue
            ev = Event(
                session_id=session_id,
                movie_id=str(m.get("id")),
                type="shown",
                reward=0.0,
                ts=now_dt,
                features={
                    "user_traits": user_traits,
                    "personality_traits": personality_traits,
                    "mood_traits": mood_traits,
                    "confidence": confidence,
                    "movie_traits": m.get("traits", {}),
                    "scores": {
                        "trait": m.get("trait_score"),
                        "text": m.get("text_score"),
                        "feedback": m.get("feedback_score"),
                        "rank": m.get("rank_score"),
                        "fit": m.get("fit_score", m.get("match")),
                        "match": m.get("match"),
                    },
                },
            )
            dbs.add(ev)
        dbs.commit()
    except Exception:
        if dbs is not None:
            dbs.rollback()
    finally:
        if dbs is not None:
            dbs.close()

    return jsonify(
        {
            "profile": {"traits": user_traits, "summary": profile_summary},
            "recommendations": enriched,
            "algo_used": ALGO_TAG,
            "algo_meta": {
                "weights": {k: round(v, 4) for k, v in weights.items()},
                "mmr_lambda": round(adaptive_lambda, 4),
                "confidence": round(overall_conf, 4),
                "retake_round": retake_round,
                "retake_avoid_count": len(retake_avoid_ids),
                "retake_avoid_removed": retake_avoid_removed,
                "retake_avoid_mode": retake_avoid_mode,
                "active_catalog_rows": active_rows,
                "candidate_limit": candidate_limit,
                "prefilter": prefilter_n,
                "result_count": result_count,
                "rerank_pool": rerank_pool_size,
                "rerank_band": rerank_band,
                "explore_ratio": round(explore_ratio, 4),
                "explore_scale": round(explore_scale, 3),
                "close_mode": close_mode,
                "relevance_floor": round(relevance_floor, 4),
                "relevance_floor_source": relevance_floor_source,
                "max_per_primary_genre": genre_cap,
                "max_per_franchise": MAX_PER_FRANCHISE,
                "popularity_bias_max": round(POPULARITY_BIAS_MAX, 4),
                "global_repeat_beta": round(GLOBAL_REPEAT_BETA, 4),
                "global_repeat_lookback_days": GLOBAL_REPEAT_LOOKBACK_DAYS,
                "dissimilar_sim_max": round(DISSIMILAR_SIM_MAX, 4),
                "dissimilar_penalty_beta": round(DISSIMILAR_PENALTY_BETA, 4),
                "dissimilar_mmr_penalty_beta": round(DISSIMILAR_MMR_PENALTY_BETA, 4),
                "dissimilar_hot_min": DISSIMILAR_HOT_MIN,
                "dissimilar_overlap_cap": DISSIMILAR_OVERLAP_CAP,
                "dissimilar_lookback_days": DISSIMILAR_LOOKBACK_DAYS,
                "global_shown_nonzero": sum(1 for v in global_shown_counts.values() if int(v) > 0),
                "dissimilar_nonzero": sum(1 for v in dissimilar_exposure_counts.values() if int(v) > 0),
            },
            "session_id": session_id,
        }
    )


@bp.post("/event")
def event():
    data = request.get_json(silent=True) or {}
    session_id = data.get("session_id") or request.headers.get("X-Session-ID") or "anon"
    movie_id = data.get("movie_id")
    etype = str(data.get("type") or "").strip().lower()
    feats = data.get("features") or {}

    reward_map = {"click": 0.2, "save": 0.6, "finish": 1.0, "dismiss": -0.2}
    default_reward = reward_map.get(etype, 0.0)
    try:
        reward = float(data.get("reward", default_reward))
    except (TypeError, ValueError):
        reward = float(default_reward)

    if not movie_id:
        return jsonify({"error": "movie_id required"}), 400

    dbs = SessionLocal()
    try:
        now_dt = datetime.now(timezone.utc)

        ev = Event(
            session_id=session_id,
            movie_id=str(movie_id),
            type=etype,
            reward=reward,
            ts=now_dt,
            features=feats,
        )
        dbs.add(ev)
        dbs.commit()

        try:
            user = feats.get("user_traits")
            movie = feats.get("movie_traits")
            if user and movie:
                x = features(user, movie)
                LINUCB.update(dbs, str(movie_id), x, reward)
        except Exception:
            pass
    except Exception as e:
        dbs.rollback()
        return jsonify({"error": f"failed to record event: {e}"}), 500
    finally:
        dbs.close()

    return {"ok": True}

