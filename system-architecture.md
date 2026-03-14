---
  title: High Level System Architecture
---
flowchart LR
      subgraph Browser["User Browser"]
        U[User]
        SPA[MindMatch SPA\nReact + TypeScript + Vite]
        LS[(LocalStorage\nsession + quiz state + retake state)]
        U --> SPA
        SPA <--> LS
      end

      subgraph Frontend["Static Frontend"]
        Router[React Router\n/, /quiz, /results]
        QuizEngine[Adaptive Quiz + Trait Context\npersonality + mood +
  blended profile]
        APIClient[API Client\npostRecommend, postEvent, getHealth]
        SPA --> Router --> QuizEngine --> APIClient
      end

      subgraph Backend["Backend API\nFlask + Gunicorn"]
        Health[GET /health]
        Recommend[POST /recommend]
        Event[POST /event]

        Profile[Profile Builder\nanswers_to_traits + summary]
        Retrieval[Hybrid Retrieval\ncentered cosine + TF-IDF]
        Rank[Weighted Ranking\ntrait + text + feedback + session]
        Guards[Guardrails\nrelevance floor + freshness / exposure penalties]
        MMR[MMR Rerank\ndiversity + overlap controls]
        Display[Display Match Score\nhybrid fit for UI]
        Shown[Auto 'shown' Event Logging]
      end
        Catalog[(SQLite Catalog\nmovies_core.db / movies.db)]
        Cache[(In-Memory Cache\nrecords + TF-IDF matrix)]
        Events[(SQLite Event DB\nevents + linucb_snapshots)]
      end

      subgraph External["External Integrations"]
        TMDB[TMDB API]
        Ingest[tmdb_ingest.py]
      end

      APIClient -->|GET| Health
      APIClient -->|POST answers + context + session_id| Recommend
      APIClient -->|POST interaction events| Event

      Recommend --> Profile --> Retrieval --> Rank --> Guards --> MMR -->
  Display --> Shown

      Catalog --> Cache --> Retrieval
      Events --> Rank
      Event --> Events
      Shown --> Events

      Recommend -. fallback poster/meta enrichment .-> TMDB
      Ingest --> Catalog