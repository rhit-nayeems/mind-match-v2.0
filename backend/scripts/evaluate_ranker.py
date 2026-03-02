#!/usr/bin/env python3
"""Offline quality checks for MindMatch recommendation outputs."""

from __future__ import annotations

import argparse
import math
import random
import statistics
import sys
from pathlib import Path
from typing import Dict, List

ROOT = Path(__file__).resolve().parents[1]
sys.path.append(str(ROOT))

from app import create_app
from app.catalog_db import count_rows

TRAIT_ORDER = ["energy", "mood", "depth", "optimism", "novelty", "comfort", "intensity", "humor", "darkness"]


def cosine(a: List[float], b: List[float]) -> float:
    num = sum(x * y for x, y in zip(a, b))
    da = math.sqrt(sum(x * x for x in a)) or 1e-9
    db = math.sqrt(sum(y * y for y in b)) or 1e-9
    return num / (da * db)


def vector_from_traits(traits: Dict[str, float]) -> List[float]:
    return [float(traits.get(k, 0.0)) for k in TRAIT_ORDER]


def ild_at_k(recs: List[dict]) -> float:
    if len(recs) < 2:
        return 0.0
    vecs = [vector_from_traits(r.get("traits") or {}) for r in recs]
    pairs = 0
    dist_sum = 0.0
    for i in range(len(vecs)):
        for j in range(i + 1, len(vecs)):
            pairs += 1
            dist_sum += 1.0 - cosine(vecs[i], vecs[j])
    return dist_sum / max(1, pairs)


def novelty_at_k(recs: List[dict]) -> float:
    vals = []
    for r in recs:
        pop = float(r.get("popularity") or 0.0)
        pop_norm = min(1.0, pop / 300.0)
        vals.append(1.0 - pop_norm)
    return sum(vals) / len(vals) if vals else 0.0


def random_answers() -> List[float]:
    # Beta(2,2)-like behavior around center keeps samples realistic.
    out = []
    for _ in range(9):
        a = random.random()
        b = random.random()
        out.append(round((a + b) / 2.0, 4))
    return out


def determinism_check(client, base_answers: List[float], runs: int = 4) -> bool:
    lists = []
    for i in range(runs):
        resp = client.post(
            "/recommend",
            json={"answers": base_answers, "session_id": f"determinism-{i}"},
        )
        if resp.status_code != 200:
            return False
        body = resp.get_json() or {}
        ids = [str(x.get("id")) for x in (body.get("recommendations") or [])]
        lists.append(ids)
    return all(lists[0] == ids for ids in lists[1:]) if lists else False


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--samples", type=int, default=120, help="Number of random users to evaluate.")
    parser.add_argument("--seed", type=int, default=42, help="Random seed.")
    parser.add_argument("--k", type=int, default=5, help="Top-k used for quality metrics.")
    args = parser.parse_args()

    random.seed(args.seed)

    app = create_app()
    client = app.test_client()

    total_catalog = count_rows()
    unique_ids = set()
    ild_scores = []
    novelty_scores = []
    match_scores = []
    failures = 0

    for i in range(args.samples):
        payload = {
            "answers": random_answers(),
            "session_id": f"eval-{i}",
        }
        resp = client.post("/recommend", json=payload)
        if resp.status_code != 200:
            failures += 1
            continue

        body = resp.get_json() or {}
        recs = (body.get("recommendations") or [])[: args.k]

        for r in recs:
            if r.get("id") is not None:
                unique_ids.add(str(r.get("id")))
            if r.get("match") is not None:
                match_scores.append(float(r.get("match")))

        ild_scores.append(ild_at_k(recs))
        novelty_scores.append(novelty_at_k(recs))

    coverage = (len(unique_ids) / total_catalog) if total_catalog else 0.0
    deterministic = determinism_check(client, [0.51] * 9)

    print("=== MindMatch Ranker Evaluation ===")
    print(f"samples={args.samples} failures={failures} k={args.k}")
    print(f"catalog_rows={total_catalog} coverage@{args.k}={coverage:.4f}")
    print(f"ild@{args.k}={statistics.mean(ild_scores) if ild_scores else 0.0:.4f}")
    print(f"novelty@{args.k}={statistics.mean(novelty_scores) if novelty_scores else 0.0:.4f}")
    print(f"match_mean={statistics.mean(match_scores) if match_scores else 0.0:.4f}")
    print(f"deterministic_same_input={deterministic}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
