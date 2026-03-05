 flowchart LR
    subgraph Browser["User Browser"]
      U[User]
      SPA[MindMatch SPA\nReact + TypeScript + Vite]
      LS[(LocalStorage\nmm_session, mm_answers,\nmm_context, recent_question_ids)]
      U --> SPA
      SPA <--> LS
    end

    subgraph FrontendService["Render Static Frontend"]
      ROUTER[React Router\n/, /quiz, /loading, /results]
      APIClient[API Client\npostRecommend, postEvent, getHealth]
      SPA --> ROUTER --> APIClient
    end

    subgraph BackendService["Render Backend API (Flask + Gunicorn)"]
      Health["GET /health"]
      Recommend["POST /recommend"]
      Event["POST /event"]

      QuizProfile["Profile Builder\nanswers_to_traits + summarize_traits"]
      Retrieval["Hybrid Retrieval\ncentered cosine + TF-IDF"]
      Rank["Weighted Ranking\ntrait/text/feedback/session"]
      Guards["Guardrails\nrelevance floor + freshness/dissimilar penalties"]
      MMR["MMR Rerank\ndiversity + overlap controls"]
      Calib["Calibration\nscore -> match %"]
      Shown["Auto 'shown' Event Logging"]
      Bandit["LinUCB Snapshot Update"]

      Recommend --> QuizProfile --> Retrieval --> Rank --> Guards --> MMR --> Calib --> Shown
      Event --> Bandit
    end

    subgraph DataLayer["Data Layer"]
      Catalog[(movies_core.db\ncatalog)]
      EventDB[(bandit.db\nevents + linucb_snapshots)]
      Cache[(In-memory Cache\nrecords + TF-IDF matrix)]
    end

    subgraph External["External Integrations"]
      TMDB[TMDB API]
      Ingest[tmdb_ingest.py]
    end

    APIClient -->|GET| Health
    APIClient -->|POST answers + context + session_id| Recommend
    APIClient -->|POST click/save/finish/dismiss| Event

    Health -->|status + catalog rows + algo| APIClient
    Recommend -->|profile + recommendations + algo_meta| APIClient
    Event -->|{ ok: true }| APIClient

    Retrieval --> Cache
    Cache --> Catalog
    Shown --> EventDB
    Event --> EventDB
    Bandit --> EventDB

    Recommend -. enrich missing poster/meta .-> TMDB
    Ingest --> Catalog
  