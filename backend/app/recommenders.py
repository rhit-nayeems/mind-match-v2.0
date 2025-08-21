from typing import Dict, List
from .similarity import cosine, TRAIT_KEYS

TRAIT_WEIGHTS = {k: 1.0 for k in TRAIT_KEYS} | {"depth": 1.15, "intensity": 1.05, "humor": 0.95}

def algo_cosine(user: Dict[str, float], movies: List[dict]) -> List[dict]:
    scored: List[dict] = []
    for m in movies:
        s = cosine(user, m.get("traits", {}))
        scored.append({**m, "match": round(float(s), 4)})
    scored.sort(key=lambda x: x["match"], reverse=True)
    return scored

def weighted_cosine(a: Dict[str,float], b: Dict[str,float]) -> float:
    num = sum(TRAIT_WEIGHTS[k]*(a.get(k,0.0))*(b.get(k,0.0)) for k in TRAIT_KEYS)
    den1 = sum(TRAIT_WEIGHTS[k]*(a.get(k,0.0)**2) for k in TRAIT_KEYS) ** 0.5
    den2 = sum(TRAIT_WEIGHTS[k]*(b.get(k,0.0)**2) for k in TRAIT_KEYS) ** 0.5
    return 0.0 if den1==0 or den2==0 else num/den1/den2

def algo_weighted_diverse(user: Dict[str,float], movies: List[dict]) -> List[dict]:
    pool: List[dict] = []
    for m in movies:
        s = weighted_cosine(user, m.get("traits", {}))
        pool.append({**m, "match": round(float(s), 4)})
    pool.sort(key=lambda x: x["match"], reverse=True)
    seen = {}
    reranked: List[dict] = []
    for item in pool:
        tag = f"{item.get('year',0)//5}_{(item.get('title','')[:1] or '_').lower()}"
        penalty = 0.07 * seen.get(tag, 0)
        adj = max(item["match"] - penalty, 0.0)
        reranked.append({**item, "match": round(adj, 4)})
        seen[tag] = seen.get(tag, 0) + 1
    reranked.sort(key=lambda x: x["match"], reverse=True)
    return reranked

TRAIT_KEYWORDS = {
    "humor": ["funny","comedy","humor","laugh","witty","improv"],
    "darkness": ["dark","noir","bleak","murder","tragic","pitch-black"],
    "intensity": ["intense","thriller","chase","edge","heat","tension","action"],
    "depth": ["thoughtful","philosophical","identity","memory","existential","reflective"],
    "optimism": ["hope","uplifting","joy","heartwarming","warm"],
    "comfort": ["cozy","home","family","gentle","calm","tender"],
    "energy": ["fast","high-velocity","adventure","adventurous","dynamic"],
    "novelty": ["experimental","strange","sci-fi","near-future","weird","original","bold"],
    "mood": ["moody","atmospheric","rain","night","tone"]
}

def _content_score(user: Dict[str,float], m: dict) -> float:
    text = (m.get("synopsis","") + " " + m.get("title","")).lower()
    score = 0.0; total_w = 0.0
    for k, kws in TRAIT_KEYWORDS.items():
        w = user.get(k, 0.5); total_w += w
        hits = sum(text.count(kw) for kw in kws)
        score += w * hits
    return 0.0 if total_w==0 else min(score/(total_w*5.0), 1.0)

def _recency_prior(m: dict) -> float:
    y = m.get("year", 2015)
    return max(0.0, min(1.0, (y - 2010) / 15.0))

def hybrid_score(user: Dict[str,float], m: dict) -> float:
    t = cosine(user, m.get("traits", {}))
    c = _content_score(user, m)
    r = _recency_prior(m)
    return 0.62*t + 0.28*c + 0.10*r

def mmr(items: List[dict], k: int = 6, lam: float = 0.75) -> List[dict]:
    chosen = []
    pool = items.copy()
    while pool and len(chosen) < k:
        best, best_val = None, -1e9
        for cand in pool:
            rel = cand["_score"]
            if chosen:
                from .similarity import cosine
                div = min(1.0 - cosine(cand.get("traits", {}), s.get("traits", {})) for s in chosen)
            else:
                div = 1.0
            val = lam * rel + (1-lam) * div
            if val > best_val:
                best, best_val = cand, val
        chosen.append(best)
        pool.remove(best)
    return chosen

def algo_advanced(user: Dict[str,float], movies: List[dict]) -> List[dict]:
    pool = []
    for m in movies:
        s = hybrid_score(user, m)
        pool.append({**m, "match": round(float(s), 4), "_score": s})
    pool.sort(key=lambda x: x["_score"], reverse=True)
    top = mmr(pool[:20], 6)

    strongest = max(user, key=user.get)
    if top:
        def contrast_score(m):
            t = m.get("traits", {}).get(strongest, 0.5)
            novelty = m.get("traits", {}).get("novelty", 0.5)
            return (1.0 - t) * 0.7 + novelty * 0.3
        tail = sorted(pool[6:36], key=contrast_score, reverse=True)
        for cand in tail:
            if cand not in top:
                weakest_i = min(range(len(top)), key=lambda i: top[i]["_score"])
                from .similarity import cosine
                div = 1.0 - cosine(cand.get("traits", {}), top[weakest_i].get("traits", {}))
                if div > 0.25:
                    top[weakest_i] = cand
                    break
    for it in top: it.pop("_score", None)
    top.sort(key=lambda x: x["match"], reverse=True)
    return top

ALGORITHMS = {
    "cosine": algo_cosine,
    "weighted_diverse": algo_weighted_diverse,
    "advanced": algo_advanced,
    "legacy": algo_cosine
}
