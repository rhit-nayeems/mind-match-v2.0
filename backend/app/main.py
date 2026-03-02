from collections import defaultdict
from datetime import datetime, timezone, timedelta
from pathlib import Path
import json
import math
import os
import re
from typing import Any, Dict, Iterable, List, Set, Tuple

from flask import Blueprint, jsonify, request

from .traits import answers_to_traits, summarize_traits
from .bandit import LinUCB, features
from .db import Event, SessionLocal, init_db
from .tmdb import enrich_movie_by_title_year
from app.catalog_db import count_rows, resolve_db_path, top_matches

bp = Blueprint("main", __name__)

MOVIES: List[Dict[str, Any]] = []
RETRIEVER = None
LINUCB = LinUCB(d=27, alpha=0.6)

MOVIE_PATH = Path(__file__).parent / "datasets" / "movies.json"
TRAIT_ORDER = ["energy", "mood", "depth", "optimism", "novelty", "comfort", "intensity", "humor", "darkness"]
INTERACTION_TYPES = {"click", "save", "finish", "dismiss"}


def _safe_float(v: Any, default: float = 0.0) -> float:
    try:
        return float(v)
    except Exception:
        return default


def _clamp01(v: float) -> float:
    return 0.0 if v < 0.0 else 1.0 if v > 1.0 else float(v)


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
    import_error = None
    if path_exists:
        try:
            rows = count_rows()
        except Exception as e:
            import_error = str(e)
    else:
        import_error = f"Catalog DB not found at {db_path}"

    return {
        "status": "ok",
        "catalog_import_ok": bool(path_exists and import_error is None),
        "catalog_import_error": import_error,
        "catalog_rows": rows,
        "db_path": db_path.replace("\\", "/"),
        "algo": "hybrid_cosine_text_feedback_mmr_v3",
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


def _get_recently_seen_ids(session_id: str, lookback_days: int = 14) -> Set[str]:
    cutoff_dt = datetime.now(timezone.utc) - timedelta(days=lookback_days)
    dbs = SessionLocal()
    try:
        q = dbs.query(Event).filter(Event.session_id == session_id)
        q = q.filter(Event.ts >= cutoff_dt)
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


def _blend_weights(overall_conf: float) -> Dict[str, float]:
    conf = _clamp01(overall_conf)
    trait_w = 0.58 + 0.24 * conf
    text_w = 0.30 - 0.12 * conf
    feedback_w = 0.12
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
    discovery_bonus = 0.04 * user_novelty * (1.0 - pop_norm)
    novelty_bonus = 0.05 * user_novelty * movie_novelty * (0.5 + 0.5 * _clamp01(overall_conf))
    comfort_bonus = 0.03 * user_comfort * movie_comfort

    return base + discovery_bonus + novelty_bonus + comfort_bonus + session_adjustment


def _adaptive_lambda(user_traits: Dict[str, float], overall_conf: float, seen_count: int) -> float:
    novelty = _clamp01(_safe_float(user_traits.get("novelty", 0.5), 0.5))
    conf = _clamp01(overall_conf)
    lam = 0.84 - 0.34 * novelty + 0.06 * (1.0 - conf)
    lam -= min(seen_count, 15) * 0.004
    return max(0.45, min(0.88, lam))


def _mmr_diversify(
    cands: List[Dict[str, Any]],
    user_traits: Dict[str, float],
    k: int = 6,
    lambda_: float = 0.70,
    seen_ids: Set[str] | None = None,
    seen_penalty: float = 0.08,
) -> List[Dict[str, Any]]:
    if not cands:
        return []

    u = _vec_from_user(user_traits)
    enriched = []
    for m in cands:
        v = _vec_from_movie(m)
        base = _safe_float(m.get("rank_score", m.get("match", _cosine(u, v))), 0.0)
        if seen_ids and str(m.get("id")) in seen_ids:
            base -= seen_penalty
        enriched.append((m, v, base))

    picked: List[Tuple[Dict[str, Any], List[float], float]] = []
    picked_roots: Set[str] = set()
    rest = enriched[:]

    while rest and len(picked) < k:
        best_idx = 0
        best_key = (-1e9, -1e9, "")

        for i, (m, v, base) in enumerate(rest):
            if not picked:
                div = 1.0
            else:
                sim = max(_cosine(v, pv) for _, pv, _ in picked)
                div = 1.0 - sim

            root = _title_root(str(m.get("title", "")))
            franchise_penalty = 0.06 if root and root in picked_roots else 0.0

            mmr = lambda_ * base + (1.0 - lambda_) * div - franchise_penalty
            tie_title = str(m.get("title", ""))
            key = (mmr, base, tie_title)
            if key > best_key:
                best_key = key
                best_idx = i

        chosen = rest.pop(best_idx)
        picked.append(chosen)
        root = _title_root(str(chosen[0].get("title", "")))
        if root:
            picked_roots.add(root)

    result = []
    for m, _, base in picked:
        m_out = dict(m)
        m_out["rank_score"] = round(base, 6)
        result.append(m_out)

    return result


def _calibrate_matches(items: List[Dict[str, Any]]) -> None:
    if not items:
        return

    scores = [_safe_float(m.get("rank_score", m.get("match", 0.0)), 0.0) for m in items]
    mu = sum(scores) / len(scores)
    var = sum((s - mu) ** 2 for s in scores) / max(1, len(scores))
    sd = math.sqrt(var) or 1e-6

    for m, s in zip(items, scores):
        z = (s - mu) / sd
        p = 1.0 / (1.0 + math.exp(-1.25 * z))
        calibrated = 0.30 + 0.68 * p
        m["match"] = round(_clamp01(calibrated), 4)


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

    user_traits = answers_to_traits(answers)
    profile_summary = summarize_traits(user_traits)

    db_path = resolve_db_path()
    if not os.path.exists(db_path):
        return jsonify({"error": f"Catalog not ready. Expected DB at: {db_path}"}), 503

    try:
        raw_cands = top_matches(
            user_traits,
            limit=140,
            prefilter=4000,
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
    session_adjustments = _get_session_adjustments(session_id)
    weights = _blend_weights(overall_conf)

    scored: List[Dict[str, Any]] = []
    for m in deduped:
        mid = str(m.get("id"))
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

        m2 = dict(m)
        m2["feedback_score"] = round(feedback_score, 6)
        m2["session_adjustment"] = round(session_adjustment, 6)
        m2["rank_score"] = round(rank_score, 6)
        scored.append(m2)

    scored.sort(
        key=lambda x: (
            _safe_float(x.get("rank_score"), 0.0),
            _safe_float(x.get("match"), 0.0),
            _safe_float(x.get("popularity"), 0.0),
        ),
        reverse=True,
    )

    seen = _get_recently_seen_ids(session_id, lookback_days=21)
    adaptive_lambda = _adaptive_lambda(user_traits, overall_conf, seen_count=len(seen))

    reranked = _mmr_diversify(
        scored[:100],
        user_traits=user_traits,
        k=6,
        lambda_=adaptive_lambda,
        seen_ids=seen,
        seen_penalty=0.08 + 0.07 * (1.0 - overall_conf),
    )

    _calibrate_matches(reranked)

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

        for m in enriched:
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
            "algo_used": "hybrid_cosine_text_feedback_mmr_v3",
            "algo_meta": {
                "weights": {k: round(v, 4) for k, v in weights.items()},
                "mmr_lambda": round(adaptive_lambda, 4),
                "confidence": round(overall_conf, 4),
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
