#!/usr/bin/env python3
"""Break down candidate flow through the current recommendation pipeline."""

from __future__ import annotations

import argparse
import json
import os
import sqlite3
import statistics
import tempfile
from collections import Counter, defaultdict
from datetime import datetime, timezone
from functools import cmp_to_key
from pathlib import Path
from typing import Any, Dict, Iterable, List, Sequence, Tuple

import compare_variants
import recommendation_audit as audit

DEFAULT_OUTPUT = Path(__file__).with_name('pipeline_breakdown_audit.json')
STAGE_NAMES = [
    'raw_hybrid_candidates',
    'candidate_limit_output',
    'post_dedupe',
    'post_relevance_floor',
    'rerank_input',
    'final_4',
]
REMOVAL_NAMES = [
    'candidate_truncation',
    'dedupe',
    'relevance_floor',
    'rerank_pool',
    'final_selection',
]
CONSTRAINT_NAMES = [
    'genre_cap',
    'franchise_cap',
    'overlap_control',
    'mmr_relevance_floor',
    'base_window',
]
EXPOSURE_NAMES = [
    'seen_ids',
    'session_adjusted_ids',
    'freshness_penalty_ids',
    'dissimilar_penalty_ids',
    'global_shown_nonzero_ids',
    'dissimilar_exposure_nonzero_ids',
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



def ordered_unique_ids(items: Iterable[Any]) -> List[str]:
    seen: set[str] = set()
    out: List[str] = []
    for item in items:
        if isinstance(item, dict):
            raw = item.get('id')
        else:
            raw = item
        movie_id = str(raw or '').strip()
        if not movie_id or movie_id in seen:
            continue
        seen.add(movie_id)
        out.append(movie_id)
    return out



def ordered_diff(before_ids: Sequence[str], after_ids: Sequence[str]) -> List[str]:
    after_set = set(after_ids)
    return [movie_id for movie_id in before_ids if movie_id not in after_set]



def stage_snapshot(items: Sequence[Dict[str, Any]]) -> Dict[str, Any]:
    return {
        'count': len(items),
        'ids': ordered_unique_ids(items),
    }



def summarize_constraint(trace: Dict[str, Any], reason: str) -> Dict[str, Any]:
    ids = list(trace['blocked_ids'].get(reason, []))
    return {
        'count': len(ids),
        'ids': ids,
        'event_count': int(trace['blocked_event_counts'].get(reason, 0)),
    }



def diagnostic_mmr_trace(
    main_mod: Any,
    cands: List[Dict[str, Any]],
    user_traits: Dict[str, float],
    *,
    k: int,
    lambda_: float,
    seen_ids: set[str] | None,
    seen_penalty: float,
    max_per_primary_genre: int,
    max_per_franchise: int,
    dissimilar_counts: Dict[str, int] | None,
    dissimilar_hot_min: int,
    dissimilar_overlap_cap: int,
    dissimilar_mmr_penalty_beta: float,
    relevance_floor: float | None,
) -> Dict[str, Any]:
    if not cands:
        empty_ids: Dict[str, List[str]] = {name: [] for name in CONSTRAINT_NAMES}
        empty_counts: Dict[str, int] = {name: 0 for name in CONSTRAINT_NAMES}
        return {
            'picked_ids': [],
            'blocked_ids': empty_ids,
            'blocked_event_counts': empty_counts,
            'strict_relaxations': 0,
            'rounds': [],
        }

    uvec = main_mod._vec_from_user(user_traits)
    enriched: List[Tuple[Dict[str, Any], List[float], float]] = []
    for movie in cands:
        movie_vec = main_mod._vec_from_movie(movie)
        base = main_mod._safe_float(movie.get('rank_score', movie.get('match', main_mod._centered_cosine01(uvec, movie_vec))), 0.0)
        if seen_ids and str(movie.get('id')) in seen_ids:
            base -= seen_penalty
        enriched.append((movie, movie_vec, base))

    picked: List[Tuple[Dict[str, Any], List[float], float]] = []
    picked_roots: Dict[str, int] = defaultdict(int)
    picked_genres: Dict[str, int] = defaultdict(int)
    rest = enriched[:]
    strict = True
    picked_hot_overlap = 0
    blocked_ids: Dict[str, List[str]] = {name: [] for name in CONSTRAINT_NAMES}
    blocked_event_counts: Dict[str, int] = {name: 0 for name in CONSTRAINT_NAMES}
    strict_relaxations = 0
    rounds: List[Dict[str, Any]] = []

    while rest and len(picked) < k:
        best_idx = -1
        best_key = (-1e9, -1e9, '')
        anchor_base = picked[0][2] if picked else max((base for _, _, base in rest), default=0.0)
        lambda_eff = max(0.72, min(0.95, lambda_ + 0.08))
        min_base_allowed = anchor_base - 0.11

        for idx, (movie, movie_vec, base) in enumerate(rest):
            movie_id = str(movie.get('id'))
            title_root = main_mod._title_root(str(movie.get('title', '')))
            primary_genre = main_mod._primary_genre(movie)
            root_count = picked_roots.get(title_root, 0) if title_root else 0
            genre_count = picked_genres.get(primary_genre, 0) if primary_genre else 0

            franchise_block = bool(title_root and max_per_franchise > 0 and root_count >= max_per_franchise)
            genre_block = bool(primary_genre and max_per_primary_genre > 0 and genre_count >= max_per_primary_genre)
            relevance_block = bool(relevance_floor is not None and main_mod._movie_relevance_score(movie) < relevance_floor)

            dissimilar_count = max(0, int((dissimilar_counts or {}).get(movie_id, 0)))
            is_dissimilar_hot = dissimilar_count >= dissimilar_hot_min
            overlap_block = bool(
                dissimilar_overlap_cap >= 0
                and is_dissimilar_hot
                and picked_hot_overlap >= dissimilar_overlap_cap
            )
            base_window_block = base < min_base_allowed

            block_map = {
                'franchise_cap': franchise_block,
                'genre_cap': genre_block,
                'mmr_relevance_floor': relevance_block,
                'base_window': base_window_block,
                'overlap_control': overlap_block,
            }
            if strict and any(block_map.values()):
                for reason, blocked in block_map.items():
                    if blocked:
                        blocked_event_counts[reason] += 1
                        if movie_id and movie_id not in blocked_ids[reason]:
                            blocked_ids[reason].append(movie_id)
                continue

            if not picked:
                diversity = 1.0
            else:
                similarity = max(main_mod._centered_cosine01(movie_vec, picked_vec) for _, picked_vec, _ in picked)
                diversity = 1.0 - similarity

            franchise_penalty = 0.06 * root_count
            genre_penalty = 0.02 * genre_count
            dissimilar_penalty = dissimilar_mmr_penalty_beta * __import__('math').log1p(dissimilar_count)
            mmr_score = lambda_eff * base + (1.0 - lambda_eff) * diversity - franchise_penalty - genre_penalty - dissimilar_penalty
            key = (mmr_score, base, str(movie.get('title', '')))
            if best_idx >= 0:
                current_best = rest[best_idx][0]
                if abs(mmr_score - best_key[0]) <= main_mod.FINAL_TIEBREAK_RANK_EPS and main_mod._near_tie_prefers_more_popular(movie, current_best):
                    best_key = key
                    best_idx = idx
                    continue
            if key > best_key:
                best_key = key
                best_idx = idx

        if best_idx < 0:
            if strict:
                strict = False
                strict_relaxations += 1
                continue
            break

        chosen_movie, _, chosen_base = rest.pop(best_idx)
        picked.append((chosen_movie, main_mod._vec_from_movie(chosen_movie), chosen_base))
        chosen_root = main_mod._title_root(str(chosen_movie.get('title', '')))
        chosen_genre = main_mod._primary_genre(chosen_movie)
        if chosen_root:
            picked_roots[chosen_root] += 1
        if chosen_genre:
            picked_genres[chosen_genre] += 1

        chosen_id = str(chosen_movie.get('id'))
        chosen_dissimilar = max(0, int((dissimilar_counts or {}).get(chosen_id, 0)))
        if chosen_dissimilar >= dissimilar_hot_min:
            picked_hot_overlap += 1

        rounds.append(
            {
                'round': len(picked),
                'chosen_id': chosen_id,
                'strict_mode': strict,
                'anchor_base': round(anchor_base, 6),
                'min_base_allowed': round(min_base_allowed, 6),
                'picked_hot_overlap': picked_hot_overlap,
            }
        )
        strict = True

    return {
        'picked_ids': [str(movie.get('id')) for movie, _, _ in picked],
        'blocked_ids': blocked_ids,
        'blocked_event_counts': blocked_event_counts,
        'strict_relaxations': strict_relaxations,
        'rounds': rounds,
    }



def analyze_profile(
    profile: Dict[str, Any],
    request_proxy: Any,
    catalog_mod: Any,
    main_mod: Any,
) -> Dict[str, Any]:
    answers = [float(value) for value in profile['answers']]
    session_id = f"pipeline-{profile['id']}"
    personality_traits: Dict[str, float] = {}
    mood_traits: Dict[str, float] = {}
    overall_conf = 0.75

    user_traits = main_mod.answers_to_traits(answers)

    active_rows = max(1, catalog_mod.count_rows())
    result_count = main_mod.RESULT_COUNT
    candidate_limit = max(main_mod.CANDIDATE_LIMIT_MIN, min(main_mod.CANDIDATE_LIMIT_MAX, int(active_rows * main_mod.CANDIDATE_LIMIT_RATIO)))
    prefilter_n = max(candidate_limit, min(active_rows, int(active_rows * 0.85)))
    rerank_pool_size = max(main_mod.RERANK_POOL_MIN, min(main_mod.RERANK_POOL_MAX, int(candidate_limit * main_mod.RERANK_POOL_RATIO)))

    raw_hybrid = catalog_mod.hybrid_candidates(
        user_traits=user_traits,
        limit=prefilter_n,
        prefilter=prefilter_n,
        query_text=None,
        personality_traits=personality_traits,
        mood_traits=mood_traits,
    )
    candidate_limited = catalog_mod.top_matches(
        user_traits=user_traits,
        limit=candidate_limit,
        prefilter=prefilter_n,
        include_scores=True,
        query_text=None,
        personality_traits=personality_traits,
        mood_traits=mood_traits,
    )
    deduped = main_mod._dedupe(candidate_limited)

    movie_ids = [str(movie.get('id')) for movie in deduped if movie.get('id') is not None]
    feedback_priors = main_mod._get_feedback_priors(movie_ids)
    global_shown_counts = main_mod._get_global_shown_counts(
        movie_ids,
        lookback_days=main_mod.GLOBAL_REPEAT_LOOKBACK_DAYS,
        exclude_session_id=session_id,
    )
    dissimilar_counts = main_mod._get_dissimilar_exposure_counts(
        movie_ids,
        user_traits=user_traits,
        lookback_days=main_mod.DISSIMILAR_LOOKBACK_DAYS,
        sim_max=main_mod.DISSIMILAR_SIM_MAX,
    )
    session_adjustments = main_mod._get_session_adjustments(session_id)
    weights = main_mod._blend_weights(overall_conf)

    scored: List[Dict[str, Any]] = []
    for movie in deduped:
        movie_id = str(movie.get('id'))
        shown_recent = max(0, int(global_shown_counts.get(movie_id, 0)))
        dissimilar_recent = max(0, int(dissimilar_counts.get(movie_id, 0)))
        feedback_score = feedback_priors.get(movie_id, 0.5)
        session_adjustment = session_adjustments.get(movie_id, 0.0)
        rank_score = main_mod._rank_score(
            movie,
            user_traits=user_traits,
            overall_conf=overall_conf,
            feedback_score=feedback_score,
            session_adjustment=session_adjustment,
            weights=weights,
        )
        freshness_penalty = main_mod.GLOBAL_REPEAT_BETA * __import__('math').log1p(shown_recent)
        dissimilar_penalty = main_mod.DISSIMILAR_PENALTY_BETA * __import__('math').log1p(dissimilar_recent)
        rank_score -= freshness_penalty + dissimilar_penalty

        movie_out = dict(movie)
        movie_out['feedback_score'] = round(feedback_score, 6)
        movie_out['freshness_shown_lookback'] = shown_recent
        movie_out['dissimilar_shown_lookback'] = dissimilar_recent
        movie_out['freshness_penalty'] = round(freshness_penalty, 6)
        movie_out['dissimilar_penalty'] = round(dissimilar_penalty, 6)
        movie_out['session_adjustment'] = round(session_adjustment, 6)
        movie_out['rank_score'] = round(rank_score, 6)
        scored.append(movie_out)

    scored.sort(key=cmp_to_key(main_mod._final_rank_cmp))
    post_relevance_floor, relevance_floor, relevance_floor_source = main_mod._apply_relevance_floor(scored, result_count=result_count)

    seen = main_mod._get_recently_seen_ids(session_id, lookback_days=21)
    adaptive_lambda = main_mod._adaptive_lambda(user_traits, overall_conf, seen_count=len(seen))
    rng = main_mod._stable_rng(session_id, user_traits, overall_conf, variant_seed='')
    close_mode = result_count <= 4
    if close_mode:
        adaptive_lambda = max(0.76, min(0.94, adaptive_lambda + 0.10))
    explore_scale = 0.28 if close_mode else 0.50
    rerank_input, explore_ratio, rerank_band = main_mod._sample_rerank_pool(
        post_relevance_floor,
        pool_size=rerank_pool_size,
        user_traits=user_traits,
        overall_conf=overall_conf,
        rng=rng,
        explore_scale=explore_scale,
    )

    genre_cap = max(3, main_mod.MAX_PER_PRIMARY_GENRE) if close_mode else main_mod.MAX_PER_PRIMARY_GENRE
    seen_penalty = 0.08 + 0.07 * (1.0 - overall_conf)
    mmr_trace = diagnostic_mmr_trace(
        main_mod,
        rerank_input,
        user_traits,
        k=result_count,
        lambda_=adaptive_lambda,
        seen_ids=seen,
        seen_penalty=seen_penalty,
        max_per_primary_genre=genre_cap,
        max_per_franchise=main_mod.MAX_PER_FRANCHISE,
        dissimilar_counts=dissimilar_counts,
        dissimilar_hot_min=main_mod.DISSIMILAR_HOT_MIN,
        dissimilar_overlap_cap=main_mod.DISSIMILAR_OVERLAP_CAP,
        dissimilar_mmr_penalty_beta=main_mod.DISSIMILAR_MMR_PENALTY_BETA,
        relevance_floor=relevance_floor,
    )

    reranked = main_mod._mmr_diversify(
        rerank_input,
        user_traits=user_traits,
        k=result_count,
        lambda_=adaptive_lambda,
        seen_ids=seen,
        seen_penalty=seen_penalty,
        max_per_primary_genre=genre_cap,
        max_per_franchise=main_mod.MAX_PER_FRANCHISE,
        dissimilar_counts=dissimilar_counts,
        dissimilar_hot_min=main_mod.DISSIMILAR_HOT_MIN,
        dissimilar_overlap_cap=main_mod.DISSIMILAR_OVERLAP_CAP,
        dissimilar_mmr_penalty_beta=main_mod.DISSIMILAR_MMR_PENALTY_BETA,
        relevance_floor=relevance_floor,
    )
    main_mod._assign_display_matches(reranked)

    request_proxy.set({'answers': answers, 'session_id': session_id}, {'X-Session-ID': session_id})
    live_payload, live_status = compare_variants.parse_response(main_mod.recommend())
    live_final_ids = ordered_unique_ids((live_payload or {}).get('recommendations') or []) if live_status == 200 else []
    replay_final_ids = ordered_unique_ids(reranked)

    raw_ids = stage_snapshot(raw_hybrid)['ids']
    candidate_ids = stage_snapshot(candidate_limited)['ids']
    deduped_ids = stage_snapshot(deduped)['ids']
    scored_ids = ordered_unique_ids(scored)
    post_relevance_ids = stage_snapshot(post_relevance_floor)['ids']
    rerank_input_ids = stage_snapshot(rerank_input)['ids']
    final_ids = stage_snapshot(reranked)['ids']

    constraints = {reason: summarize_constraint(mmr_trace, reason) for reason in CONSTRAINT_NAMES}
    exposure_effects = {
        'seen_ids': sorted(str(movie_id) for movie_id in seen),
        'session_adjusted_ids': sorted(movie_id for movie_id, value in session_adjustments.items() if abs(float(value)) > 1e-9),
        'freshness_penalty_ids': sorted(movie_id for movie_id in movie_ids if float(global_shown_counts.get(movie_id, 0)) > 0),
        'dissimilar_penalty_ids': sorted(movie_id for movie_id in movie_ids if float(dissimilar_counts.get(movie_id, 0)) > 0),
        'global_shown_nonzero_ids': sorted(movie_id for movie_id in movie_ids if int(global_shown_counts.get(movie_id, 0)) > 0),
        'dissimilar_exposure_nonzero_ids': sorted(movie_id for movie_id in movie_ids if int(dissimilar_counts.get(movie_id, 0)) > 0),
    }

    return {
        'id': profile['id'],
        'label': profile['label'],
        'group': profile['group'],
        'answers': answers,
        'blended_traits': {trait: round(float(user_traits.get(trait, 0.5)), 4) for trait in audit.TRAITS},
        'config': {
            'active_rows': active_rows,
            'result_count': result_count,
            'candidate_limit': candidate_limit,
            'prefilter': prefilter_n,
            'rerank_pool': rerank_pool_size,
            'rerank_band': rerank_band,
            'explore_ratio': round(float(explore_ratio), 4),
            'explore_scale': round(float(explore_scale), 3),
            'close_mode': close_mode,
            'relevance_floor': round(float(relevance_floor), 4),
            'relevance_floor_source': relevance_floor_source,
            'mmr_lambda': round(float(adaptive_lambda), 4),
            'max_per_primary_genre': genre_cap,
            'max_per_franchise': main_mod.MAX_PER_FRANCHISE,
            'dissimilar_overlap_cap': main_mod.DISSIMILAR_OVERLAP_CAP,
        },
        'stages': {
            'raw_hybrid_candidates': {'count': len(raw_hybrid), 'ids': raw_ids},
            'candidate_limit_output': {'count': len(candidate_limited), 'ids': candidate_ids},
            'post_dedupe': {'count': len(deduped), 'ids': deduped_ids},
            'post_relevance_floor': {'count': len(post_relevance_floor), 'ids': post_relevance_ids},
            'rerank_input': {'count': len(rerank_input), 'ids': rerank_input_ids},
            'final_4': {'count': len(reranked), 'ids': final_ids},
        },
        'removals': {
            'candidate_truncation': {'count': len(ordered_diff(raw_ids, candidate_ids)), 'ids': ordered_diff(raw_ids, candidate_ids)},
            'dedupe': {'count': len(ordered_diff(candidate_ids, deduped_ids)), 'ids': ordered_diff(candidate_ids, deduped_ids)},
            'relevance_floor': {'count': len(ordered_diff(scored_ids, post_relevance_ids)), 'ids': ordered_diff(scored_ids, post_relevance_ids)},
            'rerank_pool': {'count': len(ordered_diff(post_relevance_ids, rerank_input_ids)), 'ids': ordered_diff(post_relevance_ids, rerank_input_ids)},
            'final_selection': {'count': len(ordered_diff(rerank_input_ids, final_ids)), 'ids': ordered_diff(rerank_input_ids, final_ids)},
        },
        'constraints': constraints,
        'mmr_trace': {
            'strict_relaxations': int(mmr_trace['strict_relaxations']),
            'rounds': mmr_trace['rounds'],
            'diagnostic_final_ids': mmr_trace['picked_ids'],
        },
        'exposure_effects': exposure_effects,
        'live_recommend_consistency': {
            'status_code': int(live_status),
            'matches_runtime_output': replay_final_ids == live_final_ids,
            'replay_final_ids': replay_final_ids,
            'api_final_ids': live_final_ids,
        },
        'final_recommendations': compare_variants.extract_recommendations({'recommendations': reranked}, limit=result_count),
    }



def stats_block(values: Sequence[int]) -> Dict[str, Any]:
    numeric = [int(value) for value in values]
    if not numeric:
        return {'mean': 0.0, 'median': 0.0, 'min': 0, 'max': 0}
    return {
        'mean': round(float(statistics.mean(numeric)), 4),
        'median': round(float(statistics.median(numeric)), 4),
        'min': int(min(numeric)),
        'max': int(max(numeric)),
    }



def aggregate_profiles(profile_reports: Sequence[Dict[str, Any]]) -> Dict[str, Any]:
    stage_summary: Dict[str, Any] = {}
    for stage_name in STAGE_NAMES:
        counts = [int(report['stages'][stage_name]['count']) for report in profile_reports]
        unique_ids = ordered_unique_ids(
            movie_id
            for report in profile_reports
            for movie_id in report['stages'][stage_name]['ids']
        )
        stage_summary[stage_name] = {
            **stats_block(counts),
            'unique_id_count': len(unique_ids),
            'unique_ids': unique_ids,
        }

    removal_summary: Dict[str, Any] = {}
    for removal_name in REMOVAL_NAMES:
        counts = [int(report['removals'][removal_name]['count']) for report in profile_reports]
        unique_ids = ordered_unique_ids(
            movie_id
            for report in profile_reports
            for movie_id in report['removals'][removal_name]['ids']
        )
        removal_summary[removal_name] = {
            **stats_block(counts),
            'unique_id_count': len(unique_ids),
            'unique_ids': unique_ids,
        }

    constraint_summary: Dict[str, Any] = {}
    for constraint_name in CONSTRAINT_NAMES:
        event_counts = [int(report['constraints'][constraint_name]['event_count']) for report in profile_reports]
        counts = [int(report['constraints'][constraint_name]['count']) for report in profile_reports]
        id_counter: Counter[str] = Counter()
        for report in profile_reports:
            id_counter.update(report['constraints'][constraint_name]['ids'])
        constraint_summary[constraint_name] = {
            **stats_block(counts),
            'event_mean': round(float(statistics.mean(event_counts)), 4) if event_counts else 0.0,
            'event_total': int(sum(event_counts)),
            'unique_id_count': len(id_counter),
            'top_ids': [{'id': movie_id, 'count': count} for movie_id, count in id_counter.most_common(10)],
        }

    exposure_summary: Dict[str, Any] = {}
    for exposure_name in EXPOSURE_NAMES:
        counts = [len(report['exposure_effects'][exposure_name]) for report in profile_reports]
        unique_ids = ordered_unique_ids(
            movie_id
            for report in profile_reports
            for movie_id in report['exposure_effects'][exposure_name]
        )
        exposure_summary[exposure_name] = {
            **stats_block(counts),
            'profiles_nonzero': sum(1 for count in counts if count > 0),
            'unique_id_count': len(unique_ids),
            'unique_ids': unique_ids,
        }

    bottlenecks = [
        {
            'stage': removal_name,
            'mean_removed': removal_summary[removal_name]['mean'],
            'median_removed': removal_summary[removal_name]['median'],
            'max_removed': removal_summary[removal_name]['max'],
            'unique_id_count': removal_summary[removal_name]['unique_id_count'],
        }
        for removal_name in REMOVAL_NAMES
    ]
    bottlenecks.sort(key=lambda item: (-float(item['mean_removed']), -int(item['unique_id_count']), item['stage']))

    by_group: Dict[str, Any] = {}
    groups = sorted({report['group'] for report in profile_reports})
    for group in groups:
        group_reports = [report for report in profile_reports if report['group'] == group]
        by_group[group] = {
            'profiles': [report['id'] for report in group_reports],
            'mean_stage_counts': {
                stage_name: round(float(statistics.mean([int(report['stages'][stage_name]['count']) for report in group_reports])), 4)
                for stage_name in STAGE_NAMES
            },
            'mean_removals': {
                removal_name: round(float(statistics.mean([int(report['removals'][removal_name]['count']) for report in group_reports])), 4)
                for removal_name in REMOVAL_NAMES
            },
        }

    consistency = [bool(report['live_recommend_consistency']['matches_runtime_output']) for report in profile_reports]
    return {
        'profiles': len(profile_reports),
        'stages': stage_summary,
        'removals': removal_summary,
        'constraint_blocks': constraint_summary,
        'exposure_effects': exposure_summary,
        'bottlenecks': bottlenecks,
        'by_group': by_group,
        'live_recommend_consistency': {
            'all_profiles_match': all(consistency),
            'matched_profiles': sum(1 for matched in consistency if matched),
            'total_profiles': len(consistency),
        },
    }



def run_breakdown() -> Dict[str, Any]:
    with tempfile.TemporaryDirectory(prefix='mindmatch-pipeline-breakdown-') as tmpdir:
        bandit_db = Path(tmpdir) / 'bandit_pipeline.db'
        os.environ.pop('BANDIT_DB_URL', None)
        os.environ.pop('DB_URL', None)
        os.environ.pop('MOVIES_DB', None)
        os.environ['BANDIT_DB_PATH'] = str(bandit_db)
        os.environ['CATALOG_MAX_MOVIES'] = '0'
        os.environ['CATALOG_VARIANT'] = 'full2400'

        request_proxy, db_mod, catalog_mod, main_mod = audit.load_runtime_modules()
        db_mod._engine = None
        main_mod.init_app(None)

        db_path = catalog_mod.resolve_db_path()
        active_variant = catalog_mod.resolve_active_catalog_variant(db_path)

        profile_reports: List[Dict[str, Any]] = []
        for profile in compare_variants.PROFILE_FIXTURES:
            clear_bandit_state(bandit_db)
            profile_reports.append(analyze_profile(profile, request_proxy, catalog_mod, main_mod))

        engine = getattr(db_mod, '_engine', None)
        if engine is not None:
            engine.dispose()
            db_mod._engine = None

        return {
            'generated_at': datetime.now(timezone.utc).isoformat(),
            'catalog_variant': active_variant,
            'db_path': str(Path(db_path).resolve()).replace('\\', '/'),
            'profiles': profile_reports,
            'aggregate': aggregate_profiles(profile_reports),
        }



def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--out', type=str, default=str(DEFAULT_OUTPUT), help='Where to write the breakdown JSON.')
    args = parser.parse_args()

    report = run_breakdown()
    out_path = Path(args.out).resolve()
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(report, indent=2), encoding='utf-8')

    aggregate = report['aggregate']
    print('=== MindMatch Pipeline Breakdown Audit ===')
    print(f"profiles={aggregate['profiles']} variant={report['catalog_variant']}")
    for stage_name in STAGE_NAMES:
        stage = aggregate['stages'][stage_name]
        print(
            f"{stage_name}: mean_count={stage['mean']:.2f} median={stage['median']:.2f} "
            f"min={stage['min']} max={stage['max']} unique_ids={stage['unique_id_count']}"
        )
    for removal_name in REMOVAL_NAMES:
        removal = aggregate['removals'][removal_name]
        print(
            f"{removal_name}: mean_removed={removal['mean']:.2f} median={removal['median']:.2f} "
            f"max={removal['max']} unique_ids={removal['unique_id_count']}"
        )
    print(f"JSON report written to {out_path}")
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
