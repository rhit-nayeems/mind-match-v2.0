#!/usr/bin/env python3
"""Compare curated catalog variants without changing the recommendation pipeline."""

from __future__ import annotations

import argparse
import json
import math
import sqlite3
import tempfile
from pathlib import Path
from typing import Any, Dict, List, Sequence

import recommendation_audit as audit

PROJECT_ROOT = Path(__file__).resolve().parents[2]
BACKEND_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_DB = BACKEND_ROOT / 'app' / 'datasets' / 'movies_core.db'


def parse_float_list(raw: str | None) -> List[float]:
    return audit.parse_float_list(raw)


def load_rows(db_path: Path) -> tuple[list[dict[str, Any]], list[str], list[str]]:
    conn = sqlite3.connect(str(db_path))
    conn.row_factory = sqlite3.Row
    columns = [row[1] for row in conn.execute('PRAGMA table_info(movies)').fetchall()]
    schema_sql = [
        row[0]
        for row in conn.execute(
            """
            SELECT sql
            FROM sqlite_master
            WHERE tbl_name = 'movies' AND type IN ('table', 'index') AND sql IS NOT NULL
            ORDER BY CASE type WHEN 'table' THEN 0 ELSE 1 END, name
            """
        ).fetchall()
    ]
    rows = [dict(row) for row in conn.execute('SELECT * FROM movies').fetchall()]
    conn.close()
    return rows, columns, schema_sql


def normalize(value: float, lower: float, upper: float) -> float:
    if upper <= lower:
        return 0.0
    return max(0.0, min(1.0, (value - lower) / (upper - lower)))


def curate_rows(
    rows: Sequence[dict[str, Any]],
    limit: int,
    rating_floor: float,
    vote_weight: float,
    rating_weight: float,
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    eligible = [row for row in rows if float(row.get('vote_average') or 0.0) >= rating_floor]
    if len(eligible) < limit:
        raise ValueError(f'Not enough eligible rows for limit={limit} with rating_floor={rating_floor}')

    vote_logs = [math.log1p(max(0.0, float(row.get('vote_count') or 0.0))) for row in eligible]
    rating_values = [float(row.get('vote_average') or 0.0) for row in eligible]
    vote_min, vote_max = min(vote_logs), max(vote_logs)
    rating_min, rating_max = min(rating_values), max(rating_values)

    scored: list[tuple[float, float, float, float, dict[str, Any]]] = []
    for row in eligible:
        vote_log = math.log1p(max(0.0, float(row.get('vote_count') or 0.0)))
        rating = float(row.get('vote_average') or 0.0)
        popularity = float(row.get('popularity') or 0.0)
        vote_score = normalize(vote_log, vote_min, vote_max)
        rating_score = normalize(rating, rating_floor, rating_max if rating_max > rating_floor else rating_floor + 1.0)
        blended = vote_weight * vote_score + rating_weight * rating_score
        scored.append((blended, vote_log, rating, popularity, row))

    scored.sort(key=lambda item: (item[0], item[1], item[2], item[3]), reverse=True)
    selected = [item[4] for item in scored[:limit]]

    meta = {
        'variant_size': limit,
        'eligible_rows': len(eligible),
        'rating_floor': rating_floor,
        'vote_weight': vote_weight,
        'rating_weight': rating_weight,
        'mean_vote_count': sum(float(row.get('vote_count') or 0.0) for row in selected) / len(selected),
        'mean_vote_average': sum(float(row.get('vote_average') or 0.0) for row in selected) / len(selected),
        'mean_popularity': sum(float(row.get('popularity') or 0.0) for row in selected) / len(selected),
    }
    return selected, meta


def write_variant_db(target_path: Path, schema_sql: Sequence[str], columns: Sequence[str], rows: Sequence[dict[str, Any]]) -> None:
    if target_path.exists():
        target_path.unlink()
    conn = sqlite3.connect(str(target_path))
    for sql in schema_sql:
        conn.execute(sql)
    placeholders = ','.join('?' for _ in columns)
    insert_sql = f"INSERT INTO movies ({', '.join(columns)}) VALUES ({placeholders})"
    conn.executemany(insert_sql, [[row.get(column) for column in columns] for row in rows])
    conn.commit()
    conn.close()


def build_audit_args(args: argparse.Namespace, movies_db: Path, variant_name: str, low_popularity_threshold: float) -> argparse.Namespace:
    return argparse.Namespace(
        k=args.k,
        seed=args.seed,
        random_samples=args.random_samples,
        include_corners=args.include_corners,
        corner_low=args.corner_low,
        corner_high=args.corner_high,
        axis_values=parse_float_list(args.axis_values),
        axis_center=args.axis_center,
        grid_values=parse_float_list(args.grid_values),
        grid_limit=args.grid_limit,
        pair_samples=args.pair_samples,
        dissimilar_sim_max=args.dissimilar_sim_max,
        report_top_n=args.report_top_n,
        session_id=args.session_id,
        movies_db=str(movies_db),
        variant_name=variant_name,
        low_popularity_threshold=low_popularity_threshold,
        json_out='',
    )


def summarize_variant(report: Dict[str, Any], full_catalog_rows: int) -> Dict[str, Any]:
    catalog = report['catalog']
    repetition = report['repetition']
    display = report['display_metrics']
    return {
        'variant': catalog['variant_name'],
        'catalog_rows': catalog['active_rows'],
        'coverage_within_variant': repetition['catalog_coverage'],
        'coverage_vs_full_2400': repetition['unique_recommended_movies'] / max(1, full_catalog_rows),
        'unique_recommended_movies': repetition['unique_recommended_movies'],
        'unique_top1_movies': repetition['unique_top1_movies'],
        'unique_lists': repetition['unique_recommendation_lists'],
        'duplicate_list_rate': repetition['duplicate_list_rate'],
        'top1_concentration': repetition['top1_concentration'],
        'within_list_duplicate_ids': repetition['within_list_duplicate_id_lists'],
        'mean_displayed_popularity': display['mean_displayed_popularity'],
        'median_displayed_popularity': display['median_displayed_popularity'],
        'low_popularity_result_rate': display['low_popularity_result_rate'],
        'mean_displayed_rating': display['mean_displayed_rating'],
        'mean_displayed_fit': display['mean_displayed_fit'],
        'mean_displayed_vote_count': display['mean_displayed_vote_count'],
        'mean_overlap_at_k': report['dissimilar_overlap']['mean_overlap_at_k'],
        'any_overlap_rate': report['dissimilar_overlap']['share_with_any_overlap'],
    }


def print_variant_table(rows: Sequence[Dict[str, Any]], low_popularity_threshold: float) -> None:
    print('=== Catalog Variant Experiment ===')
    print(f'low_popularity_threshold={low_popularity_threshold:.4f}')
    print(
        'variant | rows | cov_variant | cov_full2400 | unique_top1 | dup_list | top1_conc | '
        'mean_pop | median_pop | low_pop_rate | mean_rating | mean_fit'
    )
    for row in rows:
        print(
            f"{row['variant']} | {row['catalog_rows']} | {row['coverage_within_variant']:.4f} | "
            f"{row['coverage_vs_full_2400']:.4f} | {row['unique_top1_movies']} | "
            f"{row['duplicate_list_rate']:.4f} | {row['top1_concentration']:.4f} | "
            f"{row['mean_displayed_popularity']:.4f} | {row['median_displayed_popularity']:.4f} | "
            f"{row['low_popularity_result_rate']:.4f} | {row['mean_displayed_rating']:.4f} | "
            f"{row['mean_displayed_fit']:.4f}"
        )


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source-db', type=str, default=str(DEFAULT_DB), help='Base catalog DB used for the experiments.')
    parser.add_argument('--rating-floor', type=float, default=6.2, help='Minimum vote_average required for curated variants.')
    parser.add_argument('--vote-weight', type=float, default=0.70, help='Weight for normalized log vote count in the curation score.')
    parser.add_argument('--rating-weight', type=float, default=0.30, help='Weight for normalized vote_average in the curation score.')
    parser.add_argument('--k', type=int, default=4)
    parser.add_argument('--seed', type=int, default=42)
    parser.add_argument('--random-samples', type=int, default=400)
    parser.add_argument('--include-corners', action='store_true', default=True)
    parser.add_argument('--corner-low', type=float, default=0.12)
    parser.add_argument('--corner-high', type=float, default=0.88)
    parser.add_argument('--axis-values', type=str, default='0.12,0.3,0.5,0.7,0.88')
    parser.add_argument('--axis-center', type=float, default=0.5)
    parser.add_argument('--grid-values', type=str, default='')
    parser.add_argument('--grid-limit', type=int, default=0)
    parser.add_argument('--pair-samples', type=int, default=5000)
    parser.add_argument('--dissimilar-sim-max', type=float, default=0.42)
    parser.add_argument('--report-top-n', type=int, default=5)
    parser.add_argument('--session-id', type=str, default='audit-baseline')
    parser.add_argument('--json-out', type=str, default='', help='Optional path to write the full experiment report as JSON.')
    args = parser.parse_args()

    source_db = Path(args.source_db).resolve()
    rows, columns, schema_sql = load_rows(source_db)
    full_catalog_rows = len(rows)
    low_popularity_threshold = audit.db_column_percentile(source_db, 'popularity', 0.25)

    curated_1500_rows, curated_1500_meta = curate_rows(
        rows,
        limit=1500,
        rating_floor=args.rating_floor,
        vote_weight=args.vote_weight,
        rating_weight=args.rating_weight,
    )
    curated_500_rows, curated_500_meta = curate_rows(
        rows,
        limit=500,
        rating_floor=args.rating_floor,
        vote_weight=args.vote_weight,
        rating_weight=args.rating_weight,
    )

    experiment_report: Dict[str, Any] = {
        'source_db': str(source_db),
        'rating_floor': args.rating_floor,
        'vote_weight': args.vote_weight,
        'rating_weight': args.rating_weight,
        'low_popularity_threshold': low_popularity_threshold,
        'variants': {},
        'variant_summaries': [],
        'curation': {
            'top1500': curated_1500_meta,
            'top500': curated_500_meta,
        },
    }

    with tempfile.TemporaryDirectory(prefix='mindmatch-catalog-variants-') as tmpdir:
        tmpdir_path = Path(tmpdir)
        curated_1500_db = tmpdir_path / 'movies_curated_top1500.db'
        curated_500_db = tmpdir_path / 'movies_curated_top500.db'
        write_variant_db(curated_1500_db, schema_sql, columns, curated_1500_rows)
        write_variant_db(curated_500_db, schema_sql, columns, curated_500_rows)

        variant_specs = [
            ('current-2400', source_db),
            ('curated-top1500', curated_1500_db),
            ('curated-top500', curated_500_db),
        ]

        for variant_name, variant_db in variant_specs:
            report = audit.run_audit(build_audit_args(args, variant_db, variant_name, low_popularity_threshold))
            experiment_report['variants'][variant_name] = report
            experiment_report['variant_summaries'].append(summarize_variant(report, full_catalog_rows))

    print_variant_table(experiment_report['variant_summaries'], low_popularity_threshold)

    if args.json_out:
        out_path = Path(args.json_out)
        out_path.parent.mkdir(parents=True, exist_ok=True)
        out_path.write_text(json.dumps(experiment_report, indent=2), encoding='utf-8')
        print(f'\nJSON report written to {out_path}')

    return 0


if __name__ == '__main__':
    raise SystemExit(main())
