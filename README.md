# MindMatch - Industrial Edition

MindMatch is a psychology-driven movie recommender with:
- Hybrid retrieval (trait + text)
- Weighted ranking with feedback priors
- MMR diversification
- Adaptive quiz profiling
- TMDb enrichment for posters/watch links

## Run Locally

### 1) Backend
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

# Optional: active catalog cap (defaults to 0 = uncapped active catalog)
# $env:CATALOG_MAX_MOVIES = "0"

.\.venv\Scripts\python.exe -m flask run -p 8000
```
Backend: `http://localhost:8000`

### 2) Frontend
```powershell
cd frontend
npm install
Copy-Item .env.example .env   # set VITE_API_BASE to backend URL
npm run dev
```
Frontend: `http://localhost:5173`

## Docker
```bash
docker compose up --build
```
- Frontend: `http://localhost:5173`
- Backend: `http://localhost:8000`

The backend container reads `CATALOG_MAX_MOVIES` from compose (default `0`):
- `CATALOG_MAX_MOVIES=0` keeps the active catalog uncapped
- Set a positive value if you want to experiment with a smaller active cache

## API

### POST /recommend
```json
{ "answers": [0.12, 0.71, 0.44, 0.66, 0.58, 0.31, 0.79, 0.53, 0.21], "session_id": "optional" }
```
Returns profile + ranked recommendations.

### POST /event
```json
{ "type": "click|save|finish|dismiss", "movie_id": "123", "session_id": "...", "features": { "user_traits": {}, "movie_traits": {} } }
```
Records feedback for online adjustment.

## Notes
- Quiz now runs in 2 phases: core profile + adaptive follow-up questions.
- Backend health reports both active catalog rows and total DB rows.
- Default algorithm tag: `hybrid_centered_cosine_text_feedback_mmr_v7_relevance_floor_freshness_overlap_guard`.
- TMDb attribution: "This product uses the TMDB API but is not endorsed or certified by TMDB."

## Recent Backend Tuning Notes
I ran a set of offline ranking and coverage audits before changing the live recommender. The copy improvements stayed, and the near-tie popularity tiebreak stayed because it was low-risk and measured cleanly.

I did not keep the tail-diversity experiment, the widened recall defaults, or the relaxed relevance-floor experiments as active behavior. They changed intermediate pools, but they did not produce a strong enough final recommendation win to justify shipping them.

The default production path is still the full 2400-movie catalog. I kept the curated 1500 catalog and the audit scripts around for comparison work, but they are there for testing, not as the default runtime.
