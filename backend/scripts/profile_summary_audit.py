#!/usr/bin/env python3
"""Audit profile-summary repetition without hitting the recommendation pipeline."""

from __future__ import annotations

import argparse
import json
import random
from collections import Counter
from pathlib import Path
from typing import Any, Dict, List

import recommendation_audit as audit
from app.traits import answers_to_traits, summarize_traits

DEFAULT_OUTPUT = Path(__file__).with_name('profile_summary_audit.json')


def run_summary_audit(args: argparse.Namespace) -> Dict[str, Any]:
    summaries: Counter[str] = Counter()
    samples: List[Dict[str, Any]] = []

    for profile_id, source, answers in audit.build_profile_stream(args):
        traits = answers_to_traits(answers)
        summary = summarize_traits(traits)
        summaries[summary] += 1
        samples.append(
            {
                'profile_id': profile_id,
                'source': source,
                'answers': list(answers),
                'traits': traits,
                'summary': summary,
            }
        )

    pair_rng = random.Random(args.seed + 101)
    dissimilar_pairs = 0
    identical_summary_pairs = 0
    if len(samples) >= 2 and args.pair_samples > 0:
        trait_vectors = [audit.trait_vector(sample['traits']) for sample in samples]
        for _ in range(args.pair_samples):
            left_idx, right_idx = pair_rng.sample(range(len(samples)), 2)
            sim = audit.centered_cosine01(trait_vectors[left_idx], trait_vectors[right_idx])
            if sim > args.dissimilar_sim_max:
                continue
            dissimilar_pairs += 1
            if samples[left_idx]['summary'] == samples[right_idx]['summary']:
                identical_summary_pairs += 1

    top_repeated = [
        {'summary': text, 'count': count}
        for text, count in summaries.most_common(args.report_top_n)
        if text
    ]

    total_profiles = len(samples)
    unique_summaries = len([summary for summary in summaries if summary])
    return {
        'profiles': {
            'total': total_profiles,
        },
        'summary': {
            'unique_summaries': unique_summaries,
            'summary_duplicate_rate': (1.0 - (unique_summaries / total_profiles)) if total_profiles else 0.0,
            'top_repeated_summaries': top_repeated,
        },
        'dissimilar_pairs': {
            'pair_samples': args.pair_samples,
            'eligible_pairs': dissimilar_pairs,
            'identical_summary_rate': (identical_summary_pairs / dissimilar_pairs) if dissimilar_pairs else 0.0,
        },
    }



def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--seed', type=int, default=42)
    parser.add_argument('--include-corners', action='store_true', default=False)
    parser.add_argument('--corner-low', type=float, default=0.12)
    parser.add_argument('--corner-high', type=float, default=0.88)
    parser.add_argument('--axis-values', type=str, default='')
    parser.add_argument('--axis-center', type=float, default=0.5)
    parser.add_argument('--grid-values', type=str, default='0.12,0.5,0.88')
    parser.add_argument('--grid-limit', type=int, default=0)
    parser.add_argument('--random-samples', type=int, default=0)
    parser.add_argument('--pair-samples', type=int, default=5000)
    parser.add_argument('--dissimilar-sim-max', type=float, default=0.42)
    parser.add_argument('--report-top-n', type=int, default=10)
    parser.add_argument('--json-out', type=str, default=str(DEFAULT_OUTPUT))
    args = parser.parse_args()

    args.axis_values = audit.parse_float_list(args.axis_values)
    args.grid_values = audit.parse_float_list(args.grid_values)

    report = run_summary_audit(args)

    out_path = Path(args.json_out).resolve()
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(report, indent=2), encoding='utf-8')

    print('=== MindMatch Profile Summary Audit ===')
    print(f"profiles={report['profiles']['total']}")
    print(
        f"unique_summaries={report['summary']['unique_summaries']} "
        f"summary_duplicate_rate={report['summary']['summary_duplicate_rate']:.4f}"
    )
    print(
        f"dissimilar_identical_summary_rate={report['dissimilar_pairs']['identical_summary_rate']:.4f} "
        f"eligible_pairs={report['dissimilar_pairs']['eligible_pairs']}"
    )
    if report['summary']['top_repeated_summaries']:
        print('\nTop repeated summaries:')
        for row in report['summary']['top_repeated_summaries']:
            print(f"- x{row['count']}: {row['summary']}")
    print(f'\nJSON report written to {out_path}')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
