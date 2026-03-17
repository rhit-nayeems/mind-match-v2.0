#!/usr/bin/env python3
"""Compare representative fixed profiles across the full2400 and curated1500 catalog variants."""

from __future__ import annotations

import argparse
import json
import os
import sqlite3
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Sequence, Tuple

import recommendation_audit as audit

DEFAULT_OUTPUT = Path(__file__).with_name('compare_variants_output.json')
VARIANTS = ('full2400', 'curated1500')

PROFILE_FIXTURES: List[Dict[str, Any]] = [
    {
        'id': 'comfort_warm_mainstream',
        'label': 'Comfort-first, warm, familiar',
        'group': 'mainstream_comfort',
        'answers': [0.18, 0.46, 0.34, 0.42, 0.84, 0.18, 0.90, 0.24, 0.74],
    },
    {
        'id': 'feelgood_family',
        'label': 'Optimistic and easygoing',
        'group': 'mainstream_comfort',
        'answers': [0.10, 0.48, 0.30, 0.28, 0.90, 0.16, 0.86, 0.20, 0.82],
    },
    {
        'id': 'accessible_adventure',
        'label': 'Mainstream adventure with momentum',
        'group': 'mainstream_energy',
        'answers': [0.22, 0.82, 0.46, 0.44, 0.70, 0.34, 0.52, 0.62, 0.52],
    },
    {
        'id': 'bright_crowdpleaser',
        'label': 'Upbeat crowd-pleaser',
        'group': 'mainstream_energy',
        'answers': [0.14, 0.76, 0.40, 0.34, 0.86, 0.28, 0.58, 0.48, 0.76],
    },
    {
        'id': 'dark_thoughtful',
        'label': 'Dark and emotionally deep',
        'group': 'dark_depth',
        'answers': [0.88, 0.34, 0.78, 0.90, 0.18, 0.42, 0.16, 0.72, 0.14],
    },
    {
        'id': 'moody_intense',
        'label': 'Moody, intense, psychologically heavy',
        'group': 'dark_depth',
        'answers': [0.84, 0.44, 0.86, 0.82, 0.22, 0.38, 0.18, 0.88, 0.12],
    },
    {
        'id': 'novel_dark_edge',
        'label': 'High novelty with a darker edge',
        'group': 'dark_novelty',
        'answers': [0.78, 0.58, 0.74, 0.68, 0.22, 0.90, 0.12, 0.72, 0.22],
    },
    {
        'id': 'arthouse_curious',
        'label': 'Curious, unusual, and atmospheric',
        'group': 'dark_novelty',
        'answers': [0.62, 0.40, 0.80, 0.76, 0.34, 0.92, 0.20, 0.48, 0.26],
    },
    {
        'id': 'cerebral_scifi',
        'label': 'Thoughtful sci-fi and big ideas',
        'group': 'mixed_cerebral',
        'answers': [0.46, 0.56, 0.58, 0.88, 0.44, 0.84, 0.28, 0.56, 0.24],
    },
    {
        'id': 'bittersweet_character',
        'label': 'Character-driven with some warmth',
        'group': 'mixed_character',
        'answers': [0.40, 0.38, 0.56, 0.82, 0.62, 0.40, 0.58, 0.34, 0.36],
    },
    {
        'id': 'balanced_discovery',
        'label': 'Balanced but open to discovery',
        'group': 'mixed_balanced',
        'answers': [0.42, 0.54, 0.52, 0.58, 0.56, 0.68, 0.44, 0.46, 0.42],
    },
    {
        'id': 'comfort_depth_mix',
        'label': 'Grounded, emotional, and familiar',
        'group': 'mixed_character',
        'answers': [0.30, 0.32, 0.48, 0.84, 0.64, 0.24, 0.82, 0.28, 0.32],
    },
]


def clear_bandit_state(db_path: Path) -> None:
    conn = sqlite3.connect(str(db_path))
    try:
        for table in ('events', 'linucb_snapshots'):
            try:
                conn.execute(f'DELETE FROM {table}')
            except sqlite3.OperationalError:
                pass
        conn.commit()
    finally:
        conn.close()



def parse_response(result: Any) -> Tuple[Dict[str, Any], int]:
    if isinstance(result, tuple):
        body, status_code = result
        return body or {}, int(status_code)
    return (result or {}), 200



def normalize_genres(raw: Any) -> List[str]:
    if isinstance(raw, list):
        return [str(item) for item in raw]
    if raw is None:
        return []
    return [str(raw)]



def extract_recommendations(payload: Dict[str, Any], limit: int = 4) -> List[Dict[str, Any]]:
    recs = []
    for rec in list(payload.get('recommendations') or [])[:limit]:
        fit_score = rec.get('fit_score', rec.get('match'))
        recs.append(
            {
                'id': str(rec.get('id') or ''),
                'title': rec.get('title'),
                'year': rec.get('year'),
                'director': rec.get('director'),
                'genre': normalize_genres(rec.get('genre')),
                'fit_score': float(fit_score) if fit_score is not None else None,
                'popularity': float(rec.get('popularity') or 0.0),
                'vote_count': int(float(rec.get('vote_count') or 0.0)),
            }
        )
    return recs



def run_variant(variant_name: str, profiles: Sequence[Dict[str, Any]]) -> Dict[str, Any]:
    with tempfile.TemporaryDirectory(prefix=f'mindmatch-compare-{variant_name}-') as tmpdir:
        bandit_db = Path(tmpdir) / 'bandit_compare.db'
        os.environ.pop('BANDIT_DB_URL', None)
        os.environ.pop('DB_URL', None)
        os.environ.pop('MOVIES_DB', None)
        os.environ['BANDIT_DB_PATH'] = str(bandit_db)
        os.environ['CATALOG_MAX_MOVIES'] = '0'
        os.environ['CATALOG_VARIANT'] = variant_name

        request_proxy, db_mod, catalog_mod, main_mod = audit.load_runtime_modules()
        db_mod._engine = None
        main_mod.init_app(None)

        db_path = catalog_mod.resolve_db_path()
        active_variant = catalog_mod.resolve_active_catalog_variant(db_path)
        profile_results: Dict[str, Dict[str, Any]] = {}

        for index, profile in enumerate(profiles):
            clear_bandit_state(bandit_db)
            session_id = f'compare-{variant_name}-{index:02d}-{profile["id"]}'
            request_proxy.set({'answers': profile['answers'], 'session_id': session_id}, {'X-Session-ID': session_id})
            payload, status_code = parse_response(main_mod.recommend())
            if status_code != 200:
                raise RuntimeError(f'{variant_name} failed for {profile["id"]}: status={status_code} body={payload}')

            response_profile = payload.get('profile') or {}
            blended_traits = audit.as_trait_map(
                response_profile.get('traits'),
                fallback={trait: float(profile['answers'][idx]) for idx, trait in enumerate(audit.TRAITS)},
            )
            profile_results[profile['id']] = {
                'blended_traits': blended_traits,
                'recommendations': extract_recommendations(payload, limit=4),
            }

        engine = getattr(db_mod, '_engine', None)
        if engine is not None:
            engine.dispose()
            db_mod._engine = None

        return {
            'catalog_variant': active_variant,
            'db_path': str(Path(db_path).resolve()).replace('\\', '/'),
            'profiles': profile_results,
        }



def build_report(variant_runs: Dict[str, Dict[str, Any]]) -> Dict[str, Any]:
    profiles_out: List[Dict[str, Any]] = []
    for profile in PROFILE_FIXTURES:
        profile_id = profile['id']
        answers = [float(value) for value in profile['answers']]
        answer_traits = {trait: answers[idx] for idx, trait in enumerate(audit.TRAITS)}
        blended_traits = variant_runs['full2400']['profiles'][profile_id]['blended_traits']
        profiles_out.append(
            {
                'id': profile_id,
                'label': profile['label'],
                'group': profile['group'],
                'answers': answers,
                'answer_traits': answer_traits,
                'blended_traits': blended_traits,
                'variants': {
                    variant_name: {
                        'recommendations': variant_runs[variant_name]['profiles'][profile_id]['recommendations'],
                    }
                    for variant_name in VARIANTS
                },
            }
        )

    return {
        'generated_at': datetime.now(timezone.utc).isoformat(),
        'variants': {
            variant_name: {
                'catalog_variant': variant_runs[variant_name]['catalog_variant'],
                'db_path': variant_runs[variant_name]['db_path'],
            }
            for variant_name in VARIANTS
        },
        'profiles': profiles_out,
    }



def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--out', type=str, default=str(DEFAULT_OUTPUT), help='Where to write the comparison JSON.')
    args = parser.parse_args()

    variant_runs = {variant_name: run_variant(variant_name, PROFILE_FIXTURES) for variant_name in VARIANTS}
    report = build_report(variant_runs)

    out_path = Path(args.out).resolve()
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(report, indent=2), encoding='utf-8')
    print(f'Wrote comparison report to {out_path}')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
