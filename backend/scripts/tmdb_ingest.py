#!/usr/bin/env python3
"""
scripts/tmdb_ingest.py
------------------------------------
Bulk-import thousands of movies from TMDb into a local SQLite DB
and pre-compute MindMatch trait vectors.

Usage:
  export TMDB_BEARER="<<your v4 token>>"
  python scripts/tmdb_ingest.py --pages 50 --min_votes 200 --out ./app/data/movies.db

Notes:
- Uses TMDb "discover" to pull popular, reasonably rated films (no adult).
- For each movie, fetches details + keywords + credits + watch/providers.
- Computes a 9-dim trait vector using rules in app/trait_mapping.py.
- Safe to re-run; upserts by tmdb_id.
"""
import os, sys, time, math, argparse, sqlite3, json, requests
from typing import Dict, Any, List, Tuple
from pathlib import Path

# --- Config ---
TMDB_BASE = "https://api.themoviedb.org/3"
IMG_BASE  = "https://image.tmdb.org/t/p/w500"
BEARER    = os.environ.get("TMDB_BEARER") or os.environ.get("TMDB_API_KEY")  # v4 token preferred

if not BEARER:
    print("ERROR: Set TMDB_BEARER (v4 token) or TMDB_API_KEY in env.", file=sys.stderr)
    sys.exit(1)

# Import trait mapping rules
sys.path.append(str(Path(__file__).resolve().parents[1] / "app"))
from trait_mapping import traits_from_tmdb

def http_get(url: str, params: Dict[str, Any] = None) -> Dict[str, Any]:
    headers = {}
    if "TMDB_BEARER" in os.environ:
        headers["Authorization"] = f"Bearer {os.environ['TMDB_BEARER']}"
    elif "TMDB_API_KEY" in os.environ:
        # v3 fallback
        params = dict(params or {})
        params["api_key"] = os.environ["TMDB_API_KEY"]
    r = requests.get(url, params=params, headers=headers, timeout=20)
    r.raise_for_status()
    return r.json()

def ensure_db(path: Path) -> sqlite3.Connection:
    path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(path))
    cur = conn.cursor()
    cur.execute("""
    CREATE TABLE IF NOT EXISTS movies (
      tmdb_id INTEGER PRIMARY KEY,
      title TEXT NOT NULL,
      year INTEGER,
      overview TEXT,
      poster_url TEXT,
      genres TEXT,           -- JSON array of strings
      keywords TEXT,         -- JSON array of strings
      director TEXT,
      vote_average REAL,
      vote_count INTEGER,
      popularity REAL,
      providers TEXT,        -- JSON object of country -> provider names
      traits TEXT            -- JSON object of 9 trait scores [0..1]
    );
    """)
    cur.execute("CREATE INDEX IF NOT EXISTS idx_movies_year ON movies(year);")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_movies_pop ON movies(popularity DESC);")
    conn.commit()
    return conn

def upsert_movie(conn: sqlite3.Connection, row: Dict[str, Any]):
    cur = conn.cursor()
    cur.execute("""
    INSERT INTO movies (tmdb_id, title, year, overview, poster_url, genres, keywords, director,
                        vote_average, vote_count, popularity, providers, traits)
    VALUES (:tmdb_id, :title, :year, :overview, :poster_url, :genres, :keywords, :director,
            :vote_average, :vote_count, :popularity, :providers, :traits)
    ON CONFLICT(tmdb_id) DO UPDATE SET
      title=excluded.title,
      year=excluded.year,
      overview=excluded.overview,
      poster_url=excluded.poster_url,
      genres=excluded.genres,
      keywords=excluded.keywords,
      director=excluded.director,
      vote_average=excluded.vote_average,
      vote_count=excluded.vote_count,
      popularity=excluded.popularity,
      providers=excluded.providers,
      traits=excluded.traits;
    """, row)
    conn.commit()

def enrich_one(tmdb_id: int) -> Dict[str, Any]:
    data = http_get(f"{TMDB_BASE}/movie/{tmdb_id}", params={"append_to_response": "keywords,credits,watch/providers"})
    title = data.get("title") or data.get("original_title") or ""
    release = data.get("release_date") or ""
    year = int(release[:4]) if release else None
    overview = data.get("overview") or ""
    poster_path = data.get("poster_path") or ""
    poster_url = f"{IMG_BASE}{poster_path}" if poster_path else ""
    genres = [g.get("name") for g in (data.get("genres") or [])]
    kw = [k.get("name") for k in ((data.get("keywords") or {}).get("keywords") or [])]
    director = ""
    for p in (data.get("credits") or {}).get("crew", []):
        if p.get("job") == "Director":
            director = p.get("name", "")
            break
    vote_average = data.get("vote_average") or 0.0
    vote_count = data.get("vote_count") or 0
    popularity = data.get("popularity") or 0.0

    providers_block = (data.get("watch/providers") or {}).get("results") or {}
    # collapse to a dict of country -> list of provider names (flatrate only)
    providers = {}
    for cc, obj in providers_block.items():
        names = []
        for k in ("flatrate", "rent", "buy", "ads"):
            for prov in obj.get(k, []) or []:
                n = prov.get("provider_name")
                if n and n not in names:
                    names.append(n)
        if names:
            providers[cc] = names

    traits = traits_from_tmdb(genres=genres, keywords=kw, vote_average=vote_average, popularity=popularity)

    return {
        "tmdb_id": tmdb_id,
        "title": title,
        "year": year,
        "overview": overview,
        "poster_url": poster_url,
        "genres": json.dumps(genres, ensure_ascii=False),
        "keywords": json.dumps(kw, ensure_ascii=False),
        "director": director,
        "vote_average": float(vote_average),
        "vote_count": int(vote_count),
        "popularity": float(popularity),
        "providers": json.dumps(providers, ensure_ascii=False),
        "traits": json.dumps(traits, ensure_ascii=False),
    }

def discover_pages(pages=10, min_votes=100, include_genres: List[int] = None) -> List[int]:
    ids = []
    for page in range(1, pages + 1):
        params = {
            "include_adult": "false",
            "include_video": "false",
            "language": "en-US",
            "sort_by": "popularity.desc",
            "vote_count.gte": min_votes,
            "page": page,
        }
        if include_genres:
            params["with_genres"] = ",".join(map(str, include_genres))
        j = http_get(f"{TMDB_BASE}/discover/movie", params=params)
        for m in j.get("results", []):
            if "id" in m:
                ids.append(int(m["id"]))
        time.sleep(0.15)  # be polite
    return ids

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--pages", type=int, default=50, help="How many discover pages to pull (20/pg).")
    ap.add_argument("--min_votes", type=int, default=200, help="Minimum TMDb vote_count to filter spam.")
    ap.add_argument("--out", type=str, default="./app/data/movies.db", help="SQLite DB path.")
    args = ap.parse_args()

    db_path = Path(args.out)
    conn = ensure_db(db_path)

    ids = discover_pages(pages=args.pages, min_votes=args.min_votes)
    print(f"Discovered {len(ids)} TMDb IDs; enriching…")

    for i, mid in enumerate(ids, 1):
        try:
            row = enrich_one(mid)
            upsert_movie(conn, row)
        except requests.HTTPError as e:
            print(f"[{i}/{len(ids)}] TMDb error for id={mid}: {e}", file=sys.stderr)
        except Exception as e:
            print(f"[{i}/{len(ids)}] Failed id={mid}: {e}", file=sys.stderr)
        if i % 20 == 0:
            print(f"…{i} done")

    print("Ingest complete:", db_path)

if __name__ == "__main__":
    main()
