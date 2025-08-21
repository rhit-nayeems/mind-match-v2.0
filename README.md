# MindMatch – Industrial Edition (Final)

**Groundbreaking recommender** with:
- **Hybrid AI retrieval** (OpenAI embeddings or local TF-IDF) for candidate generation.
- **Hybrid scoring**: traits cosine + content keyword hits + recency prior.
- **MMR diversification** + **serendipity injection**.
- **Online learning (LinUCB bandit)** from clicks/saves/finishes.
- **TMDb enrichment**: real posters, IMDb link, and region-aware "Where to Watch".
- Production touches: rate limiting, CORS, Sentry hooks, Docker + Compose.

---

## Run locally (Windows PowerShell shown; macOS/Linux similar)

### 1) Backend
```powershell
cd backend
py -3 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r app\requirements.txt
$env:FLASK_APP = "app:create_app"

# Optional: use OpenAI embeddings (recommended for scale)
# $env:EMBED_PROVIDER = "openai"
# $env:OPENAI_API_KEY = "sk-..."

# TMDb (choose one auth method)
# v4 bearer (preferred):
# $env:TMDB_BEARER = "<TMDB_V4_BEARER_TOKEN>"
# or v3 key:
# $env:TMDB_API_KEY = "<TMDB_V3_API_KEY>"
$env:TMDB_REGION = "US"

.\.venv\Scripts\python.exe -m flask run -p 8000
```
Server: http://localhost:8000

### 2) Frontend
```powershell
cd frontend
npm install
Copy-Item .env.example .env  # ensure VITE_API_BASE matches backend (http://localhost:8000)
npm run dev
```
Open http://localhost:5173

---

## Docker (one command)
```bash
docker compose up --build
```
- Frontend: http://localhost:5173
- Backend:  http://localhost:8000

---

## APIs

**POST /recommend**
```json
{ "answers": [0..3 x9], "session_id": "optional" }
```
Returns user profile + 6 recommendations with `links.imdb`, `links.tmdb`, `links.watch`, and `links.providers` (if TMDb configured).

**POST /event**
```json
{ "type": "click|save|finish|dismiss", "movie_id": "mm-001", "session_id": "...", "features": { "user_traits": {...}, "movie_traits": {...} } }
```

---

## Notes
- TMDb attribution: “This product uses the TMDB API but is not endorsed or certified by TMDB.”
- To scale the catalog, add a TMDb Discover loader and persist movies (easy to add later).
- Bandit state persists to SQLite; for production, point `DB_URL` at Postgres.

Enjoy 🚀
