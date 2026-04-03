# MindMatch

I built MindMatch as a movie recommender that tries to balance long-term taste with what feels right right now.

The app has three main parts:

- an adaptive quiz that separates usual taste from current mood
- a backend recommender that blends trait similarity and text similarity
- a reranking pass that tries to avoid repetitive or overly narrow results

Right now the stack is:

- frontend: React, TypeScript, Vite
- backend: Flask, Gunicorn, SQLite
- data: TMDb-based movie catalog with locally stored trait vectors

If you want the detailed repository snapshot, see [docs/project-status.md](docs/project-status.md).
If you want the high-level diagram, see [system-architecture.md](system-architecture.md).

## What The App Does

The current flow is:

1. The user lands on the homepage and starts the quiz.
2. The quiz asks core questions, then adds adaptive follow-up questions when the signal is still ambiguous.
3. The frontend sends a blended 9-trait vector plus extra context to the backend.
4. The backend pulls hybrid candidates from the catalog, scores them, applies guardrails, and reranks for diversity.
5. The results page shows the recommended movies, a profile summary, and a profile-vs-movie radar view.
6. Retakes can avoid recently shown results instead of just starting from zero again.

The backend currently supports these event types:

- `click`
- `save`
- `finish`
- `dismiss`

The active frontend currently emits `click` events when a user selects a movie card.

## How The Recommender Works

At a high level, I am using:

- trait-based similarity on a 9-dimension movie profile
- TF-IDF text retrieval over title, synopsis, genres, keywords, and director
- request-time ranking with feedback priors and session adjustments
- relevance floors and repeat suppression
- MMR-style diversification for the final result set

The default runtime path is still the full catalog.

Current default algorithm tag:

`hybrid_centered_cosine_text_feedback_mmr_v7_relevance_floor_freshness_overlap_guard`

## Catalog Status

The repo currently includes multiple SQLite catalog files under `backend/app/datasets/`.

The important ones are:

- `movies_core.db`: current default active catalog
- `movies_curated1500.db`: smaller comparison catalog kept for experiments
- `movies.db`: older or alternate catalog source still present in the repo

By default, the backend resolves to the full catalog path unless you override it.

## Run Locally

### 1. Backend

```powershell
cd backend
py -3 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r app\requirements.txt
$env:FLASK_APP = "app:create_app"

# Optional: OpenAI embeddings
# $env:EMBED_PROVIDER = "openai"
# $env:OPENAI_API_KEY = "sk-..."

# TMDb (choose one)
# $env:TMDB_BEARER = "<TMDB_V4_BEARER_TOKEN>"
# $env:TMDB_API_KEY = "<TMDB_V3_API_KEY>"
$env:TMDB_REGION = "US"

# Optional: switch catalog variant
# $env:CATALOG_VARIANT = "curated1500"

# Optional: active catalog cap (0 means uncapped active catalog)
# $env:CATALOG_MAX_MOVIES = "0"

.\.venv\Scripts\python.exe -m flask run -p 8000
```

Backend URL: `http://localhost:8000`

### 2. Frontend

```powershell
cd frontend
npm install
Copy-Item .env.example .env
npm run dev
```

Frontend URL: `http://localhost:5173`

If needed, set `VITE_API_BASE` in `frontend/.env` to point at the backend.

## Docker

```bash
docker compose up --build
```

Current compose ports:

- frontend: `http://localhost:4173`
- backend: `http://localhost:8000`

The backend container reads `CATALOG_MAX_MOVIES` from compose. The default is `0`, which keeps the active catalog uncapped.

## API

### `GET /health`

Returns a health payload with:

- catalog import status
- active catalog row count
- total DB row count
- resolved DB path
- active catalog variant
- current algorithm tag

### `POST /recommend`

Example request:

```json
{
  "answers": [0.12, 0.71, 0.44, 0.66, 0.58, 0.31, 0.79, 0.53, 0.21],
  "session_id": "optional",
  "context": {
    "personality_traits": {},
    "mood_traits": {},
    "confidence": {
      "overall": 0.82
    },
    "retake_round": 1,
    "avoid_movie_ids": ["123", "456"]
  }
}
```

Returns:

- profile traits
- profile summary text
- ranked recommendations
- algorithm metadata
- session id

### `POST /event`

Example request:

```json
{
  "type": "click",
  "movie_id": "123",
  "session_id": "optional",
  "features": {
    "user_traits": {},
    "movie_traits": {}
  }
}
```

This records feedback in the event store and updates LinUCB snapshots when the required feature payload is present.

## Current State Of The Project

A few repo-level notes so the README stays honest:

- The recommendation pipeline is in better shape than the surrounding engineering hygiene.
- I have good offline audit tooling under `backend/scripts/`, but I do not currently have a normal unit or integration test suite in the repo.
- The active backend path lives mostly in `backend/app/main.py` and `backend/app/catalog_db.py`.
- The active frontend path lives mostly in `frontend/src/pages/Quiz.tsx`, `frontend/src/pages/Results.tsx`, and `frontend/src/data/questions.ts`.
- Some older modules are still in the repo for compatibility or comparison work and are not part of the main runtime path.

## Recent Tuning Notes

I ran offline ranking and coverage audits before changing the live recommender.

What stayed:

- copy improvements
- the near-tie popularity tiebreak

What I did not keep as active behavior:

- tail-diversity experiment
- widened recall defaults
- relaxed relevance-floor experiments

Those changes moved intermediate pools around, but they did not produce a strong enough final result win to justify keeping them in the default path.

## TMDb Attribution

This product uses the TMDb API but is not endorsed or certified by TMDb.
