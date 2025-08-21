# app/trait_mapping.py
"""
Heuristic mapping from TMDb metadata to MindMatch's 9 trait dimensions.
Each score is in [0,1]. You can tune weights to your taste.
"""
from typing import List, Dict
import math

TRAITS = ["darkness","energy","mood","depth","optimism","novelty","comfort","intensity","humor"]

GENRE_W = {
    "Action":       {"energy": 0.8, "intensity": 0.6},
    "Adventure":    {"energy": 0.6, "novelty": 0.4},
    "Animation":    {"comfort": 0.5, "optimism": 0.3, "humor": 0.3},
    "Comedy":       {"humor": 0.9, "optimism": 0.3},
    "Crime":        {"darkness": 0.5, "intensity": 0.5},
    "Documentary":  {"depth": 0.7},
    "Drama":        {"depth": 0.6},
    "Family":       {"comfort": 0.9, "optimism": 0.2},
    "Fantasy":      {"novelty": 0.6, "mood": 0.2},
    "History":      {"depth": 0.5},
    "Horror":       {"darkness": 0.9, "intensity": 0.7},
    "Music":        {"mood": 0.4, "optimism": 0.3},
    "Mystery":      {"intensity": 0.6, "darkness": 0.3},
    "Romance":      {"mood": 0.5, "optimism": 0.5, "comfort": 0.2},
    "Science Fiction": {"novelty": 0.8, "energy": 0.3},
    "TV Movie":     {"comfort": 0.3},
    "Thriller":     {"intensity": 0.8, "darkness": 0.6},
    "War":          {"intensity": 0.8, "darkness": 0.6, "depth": 0.3},
    "Western":      {"novelty": 0.3, "depth": 0.2},
}

KW_W = {
    # light/feel-good
    "feel good": {"comfort": 0.8, "optimism": 0.7},
    "uplifting": {"optimism": 0.9, "mood": 0.4},
    "friendship": {"comfort": 0.6},
    "christmas": {"comfort": 0.9, "optimism": 0.3},
    "family": {"comfort": 0.7},
    # humor
    "satire": {"humor": 0.7}, "parody": {"humor": 0.8}, "stand-up": {"humor": 0.9},
    "buddy": {"humor": 0.5, "comfort": 0.2},
    # dark
    "dystopia": {"darkness": 0.8, "novelty": 0.4},
    "serial killer": {"darkness": 0.8, "intensity": 0.7},
    "tragic": {"darkness": 0.6, "depth": 0.3},
    "noir": {"darkness": 0.7, "intensity": 0.5},
    # energy / action
    "car chase": {"energy": 0.7, "intensity": 0.7},
    "martial arts": {"energy": 0.7},
    "heist": {"energy": 0.6, "intensity": 0.5},
    # novelty / sci-fi
    "time travel": {"novelty": 0.9},
    "cyberpunk": {"novelty": 0.8, "darkness": 0.3},
    "multiverse": {"novelty": 0.9},
    "space": {"novelty": 0.7},
    # depth
    "character study": {"depth": 0.8},
    "biography": {"depth": 0.6},
    "philosophy": {"depth": 0.8},
}

def traits_from_tmdb(genres: List[str], keywords: List[str], vote_average: float, popularity: float) -> Dict[str, float]:
    scores = {k: 0.0 for k in TRAITS}

    # Genre contributions
    for g in genres or []:
        w = GENRE_W.get(g, {})
        for k, v in w.items():
            scores[k] += v

    # Keyword contributions (case-insensitive substring match)
    low = [k.lower() for k in (keywords or [])]
    for key, wmap in KW_W.items():
        if any(key in k for k in low):
            for k, v in wmap.items():
                scores[k] += v

    # Normalize to [0,1] by squashing larger sums
    for k in scores:
        scores[k] = round(1 - math.exp(-scores[k]), 3)  # 1 - e^-x ⇒ [0,1)

    # Popularity/quality gentle bias
    qual = max(0.0, min(1.0, (vote_average or 0)/10))
    pop  = max(0.0, min(1.0, (popularity or 0)/300))  # rough scale
    scores["mood"] = min(1.0, scores["mood"] + 0.15*qual)
    scores["optimism"] = min(1.0, scores["optimism"] + 0.1*qual)
    scores["energy"] = min(1.0, scores["energy"] + 0.05*pop)

    return scores
