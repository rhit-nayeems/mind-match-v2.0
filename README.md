# MindMatch - AI Movie Recommender

MindMatch is a psychology-driven movie recommender with:
- 9-dimensional user/movie trait modeling
- hybrid retrieval (trait similarity + text similarity)
- confidence-aware score blending + feedback priors
- adaptive MMR reranking and calibrated match scores
- Flask API backend + React/Vite frontend
- Dockerized local run

## Algorithm (current)

`POST /recommend` now uses a multi-stage ranker:
1. Build user traits from answers.
2. Retrieve a broad candidate pool using hybrid trait + text retrieval.
3. Blend trait score, text score, and historical feedback priors.
4. Apply session-aware adjustments from recent interactions.
5. Adaptive MMR rerank (lambda based on novelty preference + confidence + repeat exposure).
6. Calibrate final match scores for stable 0..1 display.

## Local Run

### 1) Backend (Python 3.11 recommended)

```powershell
cd backend
py -3.11 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r app\requirements.txt

$env:FLASK_APP = "app:create_app"
$env:MOVIES_DB = "app/datasets/movies_core.db"
$env:TMDB_REGION = "US"

.\.venv\Scripts\python.exe -m flask run -p 8000
```

Backend: http://localhost:8000

### 2) Frontend

```powershell
cd frontend
npm install
Copy-Item .env.example .env
npm run dev
```

Frontend dev server: http://localhost:5173

## Docker

```bash
docker compose up --build
```

- Frontend (preview): http://localhost:4173
- Backend: http://localhost:8000

## API

### `POST /recommend`

```json
{
  "answers": [0.0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8],
  "session_id": "optional",
  "context": {
    "personality_traits": {},
    "mood_traits": {},
    "confidence": {
      "overall": 0.9,
      "personality": 0.9,
      "mood": 0.9,
      "per_trait": {}
    }
  }
}
```

- `answers` must be length 9.
- `context` is optional but improves ranking quality.

### `POST /event`

```json
{
  "type": "click|save|finish|dismiss|shown",
  "movie_id": "123",
  "session_id": "optional",
  "features": {
    "user_traits": {},
    "movie_traits": {}
  }
}
```

## Data Ingest (optional)

```powershell
cd backend
$env:TMDB_BEARER = "<TMDB_V4_BEARER_TOKEN>"
.\.venv\Scripts\python.exe scripts\tmdb_ingest.py --pages 50 --min_votes 200 --out ./app/datasets/movies_core.db
```

## Evaluate Ranking Quality

```powershell
cd backend
.\.venv\Scripts\python.exe scripts\evaluate_ranker.py --samples 120 --k 5
```

Outputs: coverage@k, ILD@k (intra-list diversity), novelty@k, mean match, and determinism check.

## Notes

- TMDb attribution: "This product uses the TMDB API but is not endorsed or certified by TMDB."
- Bandit/event DB env vars: `BANDIT_DB_URL` (preferred) and `DB_URL` (backward compatible).
- For production rate limiting, set `RATELIMIT_STORAGE_URI` (for example Redis) instead of in-memory defaults.
