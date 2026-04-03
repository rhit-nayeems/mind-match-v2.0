# MindMatch Project Status

## Snapshot

- Snapshot date: April 3, 2026
- Repository: `mind-match-v2.0`
- Scope of this document: current codebase status based on direct repository inspection
- Inspection basis: top-level docs, backend modules, frontend modules, Docker and compose config, dataset inventory, and backend audit tooling
- Not covered in this snapshot:
  - live production telemetry
  - real deployment health outside the repo
  - credential validity for TMDb or any other external service
  - end-to-end runtime validation against live services during this pass

## Executive Summary

MindMatch is a runnable full-stack movie recommendation application with a stronger recommendation core than its surrounding platform maturity might suggest.

The current system combines:

- a React and TypeScript SPA with a custom adaptive quiz flow
- a Flask backend that exposes `/health`, `/recommend`, and `/event`
- a hybrid recommendation pipeline that fuses trait similarity and text similarity
- request-time reranking with feedback priors, relevance floors, repeat suppression, and MMR-style diversification
- SQLite-backed catalogs and SQLite-backed event and bandit storage
- TMDb-based enrichment for posters and metadata

The project is beyond prototype stage in recommendation logic, but it is not yet fully hardened as an engineering system. The main reason is verification posture: the repository includes substantial offline audit tooling, but no conventional test suite was discovered during inspection. There is also moderate codebase drift between active runtime code and older compatibility or legacy modules.

## Overall Status Assessment

| Area | Status | Notes |
| --- | --- | --- |
| Core product flow | Working in code | Landing -> quiz -> results -> retake is implemented end to end |
| Frontend UX | Strong | Custom visual system, adaptive quiz, profile-to-movie comparison UI |
| Backend recommendation logic | Strong | Hybrid retrieval plus request-time reranking is the most mature part of the repo |
| Data ingestion | Working | TMDb ingestion script exists and catalog DBs are present in repo |
| Feedback capture | Partial | Backend accepts several event types, active UI currently emits only `click` |
| TMDb enrichment | Partial | Backend can enrich missing posters and links, active UI does not fully surface link data |
| Offline evaluation tooling | Strong | Multiple audit and comparison scripts are present |
| Formal automated tests | Weak | No conventional test files were found |
| Cleanup hygiene | Moderate debt | Active and legacy code paths coexist |
| Deployment packaging | Basic but usable | Dockerfiles and compose exist; some documentation drift exists |

## Repository Layout

| Path | Purpose | Status |
| --- | --- | --- |
| `README.md` | Main repo readme with local run instructions and algorithm notes | Active |
| `system-architecture.md` | High-level Mermaid architecture summary | Active |
| `compose.yaml` | Local Docker composition for backend and frontend | Active |
| `backend/app/` | Main backend runtime code | Active |
| `backend/scripts/` | Catalog ingestion, evaluation, audits, and comparison tooling | Active tooling |
| `backend/app/datasets/` | SQLite movie catalogs and local event DB location | Active data |
| `frontend/src/` | Main SPA source code | Active |
| `frontend/public/` | Static assets like app icon and TMDb logo | Active |
| `docs/` | Documentation folder | Previously empty before this status file |

## Product Workflow Status

### 1. Entry and Discovery

The frontend landing page is implemented in `frontend/src/pages/Landing.tsx`. It presents the product as an adaptive movie recommender, explains the quiz concept, and routes the user to `/quiz`.

### 2. Adaptive Quiz

The quiz is implemented in `frontend/src/pages/Quiz.tsx` and powered by `frontend/src/data/questions.ts`.

Current behavior:

- the quiz has two conceptual groups:
  - `personality`: what the user usually likes
  - `today`: what fits the user's current mood
- the quiz starts with a selected core question set
- it may then add an adaptive follow-up set based on ambiguity and confidence
- questions are split into paged views with personality and today prompts shown together when available
- the resulting output is a 9-dimensional blended trait vector plus separate personality and mood trait maps and confidence values

### 3. Recommendation Request

The frontend sends the following to the backend:

- a 9-value answer vector
- a session id from `localStorage`
- optional rich context:
  - `personality_traits`
  - `mood_traits`
  - `confidence`
  - `retake_round`
  - `avoid_movie_ids`

### 4. Results Experience

The active results page is `frontend/src/pages/Results.tsx`.

Current behavior:

- calls `POST /recommend`
- stores or updates result history for retake behavior
- renders four recommended movies by default, based on backend default configuration
- shows:
  - title
  - year
  - director
  - TMDb-derived vote average as stars
  - synopsis
  - genres
  - match bar
  - a radar comparison between user profile and selected movie traits
  - a generated recommendation explanation sentence
- sends a `click` event when the user selects a movie card
- supports retake flow that avoids previously shown recommendations

### 5. Retake Flow

Retake support is implemented and more advanced than a simple reset.

Current retake behavior:

- prior recommendation ids are stored in `localStorage`
- the next quiz run sets a pending retake state
- the backend receives `avoid_movie_ids`
- if enough alternate candidates exist, prior ids are removed strictly
- otherwise they are demoted rather than fully removed

## Frontend Status

## Stack and Entry Points

Frontend stack from `frontend/package.json`:

- React 18
- TypeScript
- Vite 5
- React Router 6
- Framer Motion
- Lucide React
- Recharts
- canvas-confetti
- Tailwind CSS plus a large custom CSS layer

Primary frontend entry points:

- `frontend/src/main.tsx`
- `frontend/src/router.tsx`
- `frontend/src/pages/App.tsx`

## Route Map

| Route | File | Status |
| --- | --- | --- |
| `/` | `frontend/src/pages/Landing.tsx` | Active |
| `/quiz` | `frontend/src/pages/Quiz.tsx` | Active |
| `/loading` | `frontend/src/pages/Loading.tsx` | Present but no longer central to main flow |
| `/results` | `frontend/src/pages/Results.tsx` | Active |
| `/results2` | `frontend/src/pages/ResultsPage.tsx` | Alias wrapper to same results experience |
| `errorElement` | `frontend/src/pages/RouteError.tsx` | Active fallback |

## Frontend State and Persistence

The frontend uses `localStorage` heavily. Current observed keys:

- `mm_session`
- `mm_answers`
- `mm_context`
- `mm_responses`
- `mm_page`
- `mm_version`
- `mm_recent_question_ids`
- `mm_pending_retake`
- `mm_result_history_ids`

This means the app currently operates as an anonymous, client-side session experience. There is no user account system, no server-side user identity layer, and no authentication flow in the inspected code.

## Quiz Modeling Status

The quiz system is one of the best-structured parts of the frontend.

Implemented features:

- explicit trait system with nine dimensions:
  - darkness
  - energy
  - mood
  - depth
  - optimism
  - novelty
  - comfort
  - intensity
  - humor
- split between core and adaptive question pools
- trait coverage analysis when selecting questions
- confidence scoring at:
  - overall level
  - personality-only level
  - mood-only level
  - per-trait level
- question de-duplication and recent-question avoidance across sessions

Blend logic:

- personality weight: `0.68`
- today weight: `0.32`

## Results UI Status

The active results page is modern and custom designed. It does not look like scaffolded boilerplate.

Strengths:

- strong visual identity driven by `frontend/src/index.css`
- custom animated neural backdrop in `frontend/src/components/NeuralBackdrop.tsx`
- compact but informative movie cards
- recommendation-reason generation on the client side
- profile versus selected movie radar comparison
- retake workflow integrated into the page

Current limitations:

- the active page does not render `where_to_watch` or deep TMDb/IMDb links even though backend enrichment can provide them
- only `click` feedback is emitted from the active UI
- `save`, `finish`, and `dismiss` exist in backend API semantics but are not surfaced in the active page

## Frontend API Integration Status

API client lives in `frontend/src/lib/api.ts`.

Implemented requests:

- `postRecommend`
- `postEvent`
- `getHealth`

Notable behavior:

- a 5-second in-memory request cache exists for recommendation requests
- API base is auto-detected from environment or current hostname
- the client intentionally avoids keeping a compose-style `//backend` base URL in browser runtime

## Frontend Active vs Legacy Notes

### Active frontend modules

- `frontend/src/pages/App.tsx`
- `frontend/src/pages/Landing.tsx`
- `frontend/src/pages/Quiz.tsx`
- `frontend/src/pages/Results.tsx`
- `frontend/src/pages/RouteError.tsx`
- `frontend/src/components/MoviePoster.tsx`
- `frontend/src/components/NeuralBackdrop.tsx`
- `frontend/src/data/questions.ts`
- `frontend/src/lib/api.ts`

### Compatibility or alias modules

- `frontend/src/pages/ResultsPage.tsx`
  - now just re-exports the active results page
- `frontend/src/components/Results.tsx`
  - legacy shim that re-exports the page-level results module

### Likely legacy or currently unused frontend modules

- `frontend/src/adapters/mapApiToResults.ts`
- `frontend/src/components/MovieCard.tsx`
- `frontend/src/components/MatchBars.tsx`
- `frontend/src/components/Progress.tsx`
- `frontend/src/components/RadarChart.tsx`
- `frontend/src/components/TraitRadar.tsx`

Important nuance:

- these files are not part of the currently active route flow
- some still appear to reflect earlier UI iterations
- `MovieCard.tsx` contains visible text-encoding artifacts, which is another sign it is no longer part of the active experience

## Backend Status

## Stack and Entry Points

Backend stack from `backend/app/requirements.txt`:

- Flask 3
- flask-cors
- flask-limiter
- sentry-sdk
- gunicorn
- numpy
- scikit-learn
- SQLAlchemy
- requests
- openai
- python-dotenv

Primary backend entry points:

- `backend/app/__init__.py`
- `backend/app/wsgi.py`
- `backend/app/main.py`

App factory responsibilities in `backend/app/__init__.py`:

- load environment-driven config
- configure CORS
- configure rate limiting
- initialize Sentry if DSN is present
- register main blueprint
- initialize database and optional retrieval state

## Active API Surface

| Endpoint | Method | Purpose | Status |
| --- | --- | --- | --- |
| `/health` | GET | Reports catalog path, rows, active variant, algorithm tag | Active |
| `/recommend` | POST | Main recommendation request | Active |
| `/event` | POST | Records user feedback and updates bandit state | Active |

## Recommendation Pipeline Status

The current recommendation logic is the most mature subsystem in the repository.

High-level flow for `POST /recommend`:

1. Validate incoming `answers` as a length-9 array.
2. Read optional session id and rich context.
3. Convert answers into trait values with `answers_to_traits`.
4. Generate a human-readable profile summary with `summarize_traits`.
5. Resolve the active catalog DB and ensure it exists.
6. Retrieve hybrid candidates from `catalog_db.top_matches`.
7. Apply request-time scoring using:
   - trait score
   - text score
   - feedback priors
   - session adjustments
   - light popularity bias
   - novelty and comfort bonuses
   - freshness penalties
   - dissimilar-exposure penalties
8. Apply explicit avoidance for retake ids when present.
9. Apply relevance floor filtering.
10. Sample a rerank pool with deterministic seeded exploration.
11. Run `_mmr_diversify` with genre, franchise, overlap, and relevance constraints.
12. Assign public-facing display match scores.
13. Attempt fallback TMDb enrichment when a poster is missing.
14. Auto-log `shown` events for the returned items.
15. Return profile, recommendations, algorithm tag, and detailed algorithm metadata.

## Catalog Retrieval Status

Catalog retrieval is implemented in `backend/app/catalog_db.py`.

Active behavior:

- reads from SQLite `movies` table
- caches full active catalog records in memory
- builds a TF-IDF vectorizer and matrix from title, synopsis, genre, keywords, and director
- scores the active catalog in trait space
- optionally derives query text from top user, personality, and mood traits
- scores text relevance in TF-IDF space
- fuses trait and text scores into candidate ranking

Observed catalog defaults:

- default catalog variant: `full2400`
- default DB resolution prefers `movies_core.db`
- optional active catalog cap is controlled by `CATALOG_MAX_MOVIES`

## Feedback and Persistence Status

Persistence is split into two broad areas.

### 1. Movie catalog storage

This is SQLite catalog data under `backend/app/datasets/`.

Observed catalog files:

| File | Size (bytes) | Status |
| --- | ---: | --- |
| `movies.db` | 45,019,136 | Legacy or alternate catalog source |
| `movies_core.db` | 14,872,576 | Current default active catalog |
| `movies_curated1500.db` | 9,584,640 | Alternate curated catalog variant |

### 2. Event and bandit storage

Event and bandit state is handled by `backend/app/db.py`.

Persisted entities:

- `events`
- `linucb_snapshots`

Event model captures:

- `session_id`
- `movie_id`
- `type`
- `reward`
- timestamp
- JSON feature payload

## Bandit Status

The backend includes a LinUCB implementation in `backend/app/bandit.py`.

Current state of bandit usage:

- `POST /event` updates LinUCB snapshots when both user and movie trait maps are present
- the current `POST /recommend` ranking path does not call `LINUCB.score`
- practical effect: the bandit subsystem is collecting state, but it is not a first-class scoring input in the active ranking path

This is an important status nuance. The repository has live bandit persistence, but the recommendation path is currently dominated by event-derived priors and reranking logic, not active contextual bandit scoring.

## TMDb Integration Status

TMDb behavior is implemented in `backend/app/tmdb.py` and `backend/scripts/tmdb_ingest.py`.

Current TMDb usage:

- ingestion script to build the movie catalog
- backend fallback enrichment for missing poster and metadata
- watch-provider extraction by region

Status notes:

- the integration is real and functional in code
- enrichment errors are swallowed gracefully, which keeps requests resilient
- the active UI does not currently surface the full set of available link data

## Backend Configuration Status

### Core service and runtime config

Configured in `backend/app/__init__.py`:

- `SENTRY_DSN`
- `RATELIMIT_DEFAULT`
- `RATELIMIT_STORAGE_URI`
- `CORS_ALLOW_ORIGINS`
- `EMBED_PROVIDER`
- `OPENAI_API_KEY`
- `EMBED_MODEL`
- `DB_URL`
- `TMDB_BEARER`
- `TMDB_API_KEY`
- `TMDB_REGION`

### Catalog config

Configured mainly in `backend/app/catalog_db.py`:

- `MOVIES_DB`
- `CATALOG_VARIANT`
- `CATALOG_MAX_MOVIES`

### Event and bandit DB config

Configured in `backend/app/db.py`:

- `BANDIT_DB_URL`
- `DB_URL`
- `BANDIT_DB_PATH`

### Ranking and reranking config

Configured in `backend/app/main.py` through many `MM_*` environment variables, including:

- result count
- candidate limits
- rerank pool sizing
- popularity bias
- relevance floor tuning
- freshness penalty tuning
- dissimilar-exposure tuning
- tie-break thresholds

Status assessment:

- the backend is highly tunable
- the large number of knobs supports experimentation
- the same knob surface increases complexity and makes regression testing more important

## Backend Active vs Legacy Notes

### Active backend modules

- `backend/app/__init__.py`
- `backend/app/main.py`
- `backend/app/catalog_db.py`
- `backend/app/db.py`
- `backend/app/bandit.py`
- `backend/app/tmdb.py`
- `backend/app/traits.py`
- `backend/app/trait_mapping.py`
- `backend/app/wsgi.py`

### Partially active or compatibility backend modules

- `backend/app/retrieval.py`
- `backend/app/embeddings.py`
- `backend/app/similarity.py`

These modules are still referenced during app initialization because `main.py` attempts to build a `RETRIEVER` from an optional `movies.json` file, but the active recommendation path does not use this retriever for candidate generation.

### Likely legacy backend module

- `backend/app/recommenders.py`

This file contains older scoring algorithms, but the active `/recommend` path uses `catalog_db.top_matches` and the ranking logic in `main.py`, not the exported algorithms in `recommenders.py`.

## Data and Catalog Status

## Catalog Build Process

The catalog ingestion script `backend/scripts/tmdb_ingest.py`:

- pulls pages from TMDb discover
- fetches per-movie details, keywords, credits, and watch-provider data
- computes MindMatch trait vectors using heuristic mappings
- upserts into a SQLite `movies` table

The trait mapping is rule-based, not learned. It relies on:

- genre weights
- keyword weights
- gentle vote-average and popularity adjustments

## Current Catalog Variants

Observed variants:

- `full2400`
- `curated1500`
- fallback or custom path support

Current default runtime path:

- `full2400`

Current project stance from README and code:

- the full catalog is the intended production default
- the curated catalog is kept for comparison and experiments, not as the primary runtime default

## Audit and Evaluation Tooling Status

This repository has unusually strong offline recommendation-analysis tooling compared with its formal test posture.

Observed scripts:

| Script | Purpose | Status |
| --- | --- | --- |
| `backend/scripts/tmdb_ingest.py` | Build or refresh catalog DB from TMDb | Active tooling |
| `backend/scripts/recommendation_audit.py` | Audit repetition, copy diversity, coverage, and distribution behavior | Active tooling |
| `backend/scripts/pipeline_breakdown_audit.py` | Trace candidate flow through the pipeline and diagnose removals | Active tooling |
| `backend/scripts/quality_gates.py` | Enforce recommendation quality and overlap thresholds | Active tooling |
| `backend/scripts/compare_variants.py` | Compare full and curated catalog variants on fixed profiles | Active tooling |
| `backend/scripts/catalog_variant_experiments.py` | Build and summarize experimental catalog variants | Active tooling |
| `backend/scripts/evaluate_ranker.py` | Evaluate determinism and ranker behavior | Active tooling |
| `backend/scripts/profile_summary_audit.py` | Audit trait summary output quality | Active tooling |

Status assessment:

- recommendation logic appears to be tuned through offline audits rather than through unit tests
- this is good for recommender iteration quality
- this is not a replacement for regression tests around API contracts, state handling, and integration seams

## Testing and Verification Status

## Conventional Tests

No conventional test files were found during inspection under common patterns such as:

- `test_*.py`
- `*test*.py`
- `*.test.ts`
- `*.test.tsx`
- `*.spec.ts`
- `*.spec.tsx`

Status conclusion:

- there is no visible standard unit or integration test suite in the repository as inspected

## Quality Gates

The repository does include script-based verification:

- recommendation quality gates
- pipeline trace audits
- variant comparison reports
- profile summary audits

This means the project has meaningful evaluation discipline, but it is concentrated in ad hoc or script-driven workflows rather than a conventional automated test framework.

## Deployment and Runtime Packaging Status

## Local Run Paths

The README documents separate local backend and frontend runs.

Backend:

- Flask app factory pattern
- local virtual environment setup expected

Frontend:

- Vite dev server
- `.env.example` points to backend on port `8000`

## Docker Status

### Backend Dockerfile

`backend/Dockerfile`:

- uses `python:3.11-slim`
- installs `requirements.txt`
- runs Gunicorn with:
  - 1 worker
  - `gthread`
  - 4 threads
  - bind `0.0.0.0:8000`

### Frontend Dockerfile

`frontend/Dockerfile`:

- uses `node:20-alpine`
- installs dependencies
- builds Vite assets
- serves with `vite preview` on port `4173`

### Compose status

`compose.yaml` defines:

- `backend` on `8000:8000`
- `frontend` on `4173:4173`

Observed documentation discrepancy:

- `README.md` says Docker frontend is `http://localhost:5173`
- `compose.yaml` actually exposes frontend on `4173`

This should be treated as a real documentation drift item.

## Documentation Status

## Existing docs

- `README.md`
- `system-architecture.md`

## Documentation quality

Strengths:

- README correctly explains the broad product concept
- README matches the overall architecture direction
- architecture doc gives a useful high-level picture

Gaps or mismatches:

- Docker frontend port mismatch, as noted above
- README mentions watch-link enrichment at a product level, but the active UI does not currently surface that capability in the main results experience

## Known Gaps and Technical Debt

### 1. Mixed active and legacy code

The repository contains a meaningful amount of older or compatibility code adjacent to active runtime code. This increases ambiguity when maintaining or refactoring the system.

### 2. Weak conventional test posture

The absence of normal automated tests makes cleanup and feature changes riskier than they should be.

### 3. Config drift

Observed examples:

- frontend env keys `VITE_QUIZ_PROFILE` and `VITE_QUIZ_V2_ROLLOUT_PERCENT` exist but were not observed in active frontend source usage
- Tailwind `brand` colors appear to be used only by an inactive progress component

### 4. Partial feedback loop in the UI

Backend supports:

- `click`
- `save`
- `finish`
- `dismiss`

Active frontend currently emits:

- `click` only

This means the feedback model is richer than the current product surface.

### 5. Bandit subsystem is not fully integrated into active scoring

LinUCB state is updated, but not used directly in the active ranking path.

### 6. Anonymous client-side session model

The product currently depends on local browser storage and anonymous session ids. This is fine for a lightweight app, but it limits:

- portability across devices
- durable user history
- authenticated personalization

### 7. SQLite is a practical but narrow persistence choice

SQLite is appropriate for local use, demos, and small deployments. It becomes a limit if the product grows into:

- high write concurrency
- distributed deployment
- more complex analytics or user models

### 8. Some initialization code is tolerant to failure in ways that hide drift

Examples:

- optional `movies.json` load and `RETRIEVER` build in backend init
- broad exception swallowing around TMDb enrichment and some startup behavior

This improves resilience, but can also conceal stale code paths.

## Key Precision Notes

These points are important because they are easy to misunderstand from a shallow pass.

1. The active recommendation engine is not the code in `backend/app/recommenders.py`.
   The active engine is the combination of `backend/app/catalog_db.py` and `backend/app/main.py`.

2. The backend still initializes optional retrieval state from `backend/app/retrieval.py`, but that retriever is not the active candidate-generation path for `/recommend`.

3. The frontend main results route is `frontend/src/pages/Results.tsx`.
   `ResultsPage.tsx` is now just an alias wrapper.

4. TMDb integration is real, but active UI exposure is partial.
   Posters and rating data are visible; deep watch links are not currently surfaced in the active results page.

5. The project has meaningful evaluation tooling even though it lacks standard tests.
   It would be incorrect to call the repo "untested," but it would also be incorrect to call it "well covered" in the conventional automated-testing sense.

## Current Strengths

- clear product concept
- working end-to-end user flow
- sophisticated ranking pipeline relative to repo size
- adaptive quiz with confidence-aware follow-up logic
- usable local run and Docker packaging
- strong offline audit and comparison tooling
- distinctive frontend presentation rather than generic scaffold output

## Current Weaknesses

- weak formal automated testing
- active and legacy modules are intermingled
- some documentation drift
- feedback UI is narrower than backend capability
- partial config drift in frontend env and styling layers
- bandit scoring path is not fully active in recommendations

## Recommended Next Steps

### High priority

1. Add a small conventional test suite around:
   - `/recommend` request contract
   - `/event` persistence behavior
   - quiz trait-context conversion
   - retake state handling

2. Reconcile docs with actual runtime behavior:
   - Docker frontend port
   - whether watch links are a visible user-facing feature today

3. Explicitly label modules as:
   - active runtime
   - audit/tooling
   - compatibility shim
   - legacy candidate for removal

### Medium priority

4. Decide whether LinUCB should:
   - become part of active ranking
   - or remain offline or future-facing
   - or be removed from the live path

5. Expand frontend feedback surface if desired:
   - save
   - dismiss
   - finish

6. Surface provider or watch-link data in the active results UI if that is still a product goal.

### Lower priority but worthwhile

7. Remove stale config keys and unused frontend legacy components after verification.

8. Consider separating committed catalog artifacts from source code concerns if repository size or change management becomes painful.

## Final Status Statement

MindMatch is currently best described as a recommendation-focused application with a working product flow, a comparatively sophisticated ranking core, and a medium level of engineering debt around verification, cleanup, and active-versus-legacy code boundaries.

It is not a rough proof of concept. It is also not yet a fully hardened production codebase. The recommendation system itself is the strongest and most developed part of the project. The next engineering gains should come from tightening verification, clarifying code ownership by path, and aligning the user-facing experience with the capabilities already present in the backend.
