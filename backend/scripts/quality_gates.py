#!/usr/bin/env python3
"""Quality gates for MindMatch recommendation quality and overlap behavior."""

from __future__ import annotations

import argparse
import math
import os
import random
import statistics
import sys
from collections import Counter
from pathlib import Path
from typing import Dict, List, Tuple

ROOT = Path(__file__).resolve().parents[1]
sys.path.append(str(ROOT))

os.environ.setdefault("RATELIMIT_DEFAULT", "100000 per minute")

from app import create_app  # noqa: E402

TRAIT_ORDER = ["energy", "mood", "depth", "optimism", "novelty", "comfort", "intensity", "humor", "darkness"]


def cosine(a: List[float], b: List[float]) -> float:
    num = sum(x * y for x, y in zip(a, b))
    da = math.sqrt(sum(x * x for x in a)) or 1e-9
    db = math.sqrt(sum(y * y for y in b)) or 1e-9
    return num / (da * db)


def centered_cosine01(a: List[float], b: List[float]) -> float:
    ac = [x - 0.5 for x in a]
    bc = [y - 0.5 for y in b]
    return max(0.0, min(1.0, 0.5 * (cosine(ac, bc) + 1.0)))


def trait_vec_from_movie(movie: Dict) -> List[float]:
    t = movie.get("traits") or {}
    if isinstance(t, list):
        vec = [float(x) for x in t]
    else:
        vec = [float(t.get(k, 0.5)) for k in TRAIT_ORDER]
    return [max(0.0, min(1.0, v)) for v in vec]


def random_answers() -> List[float]:
    # Beta(2,2)-like sampling around center
    out = []
    for _ in range(9):
        a = random.random()
        b = random.random()
        out.append(round((a + b) / 2.0, 4))
    return out


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--samples", type=int, default=400)
    parser.add_argument("--k", type=int, default=4)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--pair-samples", type=int, default=3000)
    parser.add_argument("--dissimilar-sim-max", type=float, default=0.42)

    parser.add_argument("--min-avg-trait-cos", type=float, default=0.64)
    parser.add_argument("--max-dissimilar-overlap", type=float, default=0.30)
    parser.add_argument("--max-top1-concentration", type=float, default=0.08)

    args = parser.parse_args()
    random.seed(args.seed)

    app = create_app()
    client = app.test_client()

    user_vecs: List[List[float]] = []
    rec_lists: List[List[str]] = []
    top1: List[str] = []
    trait_cos_scores: List[float] = []
    failures = 0

    for i in range(args.samples):
        answers = random_answers()
        resp = client.post("/recommend", json={"answers": answers, "session_id": f"gate-{i}", "k": args.k})
        if resp.status_code != 200:
            failures += 1
            continue

        body = resp.get_json() or {}
        recs = (body.get("recommendations") or [])[: args.k]
        if len(recs) < args.k:
            failures += 1
            continue

        # API answer order is darkness->...; map to TRAIT_ORDER order
        darkness_first = [float(x) for x in answers]
        user_map = {
            "darkness": darkness_first[0],
            "energy": darkness_first[1],
            "mood": darkness_first[2],
            "depth": darkness_first[3],
            "optimism": darkness_first[4],
            "novelty": darkness_first[5],
            "comfort": darkness_first[6],
            "intensity": darkness_first[7],
            "humor": darkness_first[8],
        }
        u = [user_map[k] for k in TRAIT_ORDER]
        user_vecs.append(u)

        ids = [str(x.get("id")) for x in recs]
        rec_lists.append(ids)
        top1.append(ids[0])

        for m in recs:
            mv = trait_vec_from_movie(m)
            trait_cos_scores.append(centered_cosine01(u, mv))

    n = len(rec_lists)
    if n == 0:
        print("FAIL: no successful recommendation samples")
        return 1

    avg_trait_cos = statistics.mean(trait_cos_scores) if trait_cos_scores else 0.0
    top1_counts = Counter(top1)
    top1_concentration = (top1_counts.most_common(1)[0][1] / n) if top1_counts else 0.0

    dissimilar_overlaps: List[float] = []
    if n >= 2:
        for _ in range(args.pair_samples):
            i, j = random.sample(range(n), 2)
            sim = centered_cosine01(user_vecs[i], user_vecs[j])
            if sim > args.dissimilar_sim_max:
                continue
            overlap = len(set(rec_lists[i]) & set(rec_lists[j])) / max(1, args.k)
            dissimilar_overlaps.append(overlap)

    mean_dissimilar_overlap = statistics.mean(dissimilar_overlaps) if dissimilar_overlaps else 0.0
    p90_dissimilar_overlap = (
        sorted(dissimilar_overlaps)[int(0.9 * (len(dissimilar_overlaps) - 1))] if dissimilar_overlaps else 0.0
    )

    print("=== MindMatch Quality Gates ===")
    print(f"samples={n} failures={failures} k={args.k}")
    print(f"avg_trait_cos={avg_trait_cos:.4f} (min {args.min_avg_trait_cos:.4f})")
    print(f"dissimilar_pairs={len(dissimilar_overlaps)}")
    print(
        f"dissimilar_overlap_mean={mean_dissimilar_overlap:.4f} p90={p90_dissimilar_overlap:.4f} "
        f"(max_mean {args.max_dissimilar_overlap:.4f})"
    )
    print(f"top1_concentration={top1_concentration:.4f} (max {args.max_top1_concentration:.4f})")

    failed = False
    if avg_trait_cos < args.min_avg_trait_cos:
        print("GATE_FAIL: avg_trait_cos below threshold")
        failed = True
    if mean_dissimilar_overlap > args.max_dissimilar_overlap:
        print("GATE_FAIL: dissimilar overlap mean above threshold")
        failed = True
    if top1_concentration > args.max_top1_concentration:
        print("GATE_FAIL: top1 concentration above threshold")
        failed = True

    if failed:
        return 1

    print("GATE_PASS")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
