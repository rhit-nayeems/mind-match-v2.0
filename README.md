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

# Optional: active catalog cap (defaults to 500 most-popular movies)
# $env:CATALOG_MAX_MOVIES = "500"

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

The backend container reads `CATALOG_MAX_MOVIES` from compose (default `500`):
- `CATALOG_MAX_MOVIES=500` keeps recommendations inside the top 500 popular titles
- Increase/decrease as needed

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
- Default algorithm tag: `hybrid_cosine_text_feedback_mmr_v4_top500`.
- TMDb attribution: "This product uses the TMDB API but is not endorsed or certified by TMDB."
