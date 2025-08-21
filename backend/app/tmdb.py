import os, requests
from functools import lru_cache

TMDB_BEARER = os.getenv("TMDB_BEARER")
TMDB_API_KEY = os.getenv("TMDB_API_KEY")
TMDB_REGION = os.getenv("TMDB_REGION", "US")
BASE = "https://api.themoviedb.org/3"

def _headers():
    if TMDB_BEARER:
        return {"Authorization": f"Bearer {TMDB_BEARER}"}
    return {}

def _params(extra=None):
    p = {"language":"en-US"}
    if TMDB_API_KEY and not TMDB_BEARER:
        p["api_key"] = TMDB_API_KEY
    if extra: p.update(extra)
    return p

@lru_cache(maxsize=2048)
def image_base_url():
    r = requests.get(f"{BASE}/configuration", headers=_headers(), params=_params())
    r.raise_for_status()
    images = r.json().get("images", {})
    base = images.get("secure_base_url", "https://image.tmdb.org/t/p/")
    size = "w500"
    return base, size

def build_poster_url(poster_path: str|None) -> str|None:
    if not poster_path: return None
    base, size = image_base_url()
    return f"{base}{size}{poster_path}"

def search_movie(title: str, year: int|None):
    r = requests.get(f"{BASE}/search/movie",
        headers=_headers(),
        params=_params({"query": title, "year": year or ""}))
    r.raise_for_status()
    results = r.json().get("results", [])
    return results[0] if results else None

def movie_full(tmdb_id: int):
    r = requests.get(f"{BASE}/movie/{tmdb_id}",
        headers=_headers(),
        params=_params({"append_to_response": "external_ids,watch/providers"}))
    r.raise_for_status()
    return r.json()

def extract_links(full: dict) -> dict:
    imdb_id = (full.get("external_ids") or {}).get("imdb_id")
    imdb = f"https://www.imdb.com/title/{imdb_id}" if imdb_id else None
    tmdb = f"https://www.themoviedb.org/movie/{full.get('id')}"
    providers = []
    watch = None
    wp = (full.get("watch/providers") or {}).get("results", {})
    region = wp.get(TMDB_REGION)
    if region:
        watch = region.get("link")
        for bucket in ("flatrate","rent","buy","ads","free"):
            for p in region.get(bucket, []) or []:
                providers.append(p.get("provider_name"))
    uniq = []
    [uniq.append(n) for n in providers if n and n not in uniq]
    return {"imdb": imdb, "tmdb": tmdb, "watch": watch, "providers": uniq[:6]}

def enrich_movie_by_title_year(m: dict) -> dict:
    title, year = m.get("title"), m.get("year")
    try:
        hit = search_movie(title, year)
        if not hit:
            hit = search_movie(title, None)
        if not hit: return m
        full = movie_full(hit["id"])
        poster = build_poster_url(full.get("poster_path"))
        links = extract_links(full)
        return {
            **m,
            "posterUrl": poster or m.get("posterUrl"),
            "synopsis": full.get("overview") or m.get("synopsis"),
            "links": links
        }
    except Exception:
        return m
