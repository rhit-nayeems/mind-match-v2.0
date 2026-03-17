#!/usr/bin/env python3
"""Audit recommendation repetition, copy diversity, and catalog coverage."""

from __future__ import annotations

import argparse
import importlib
import itertools
import json
import math
import sqlite3
import os
import random
import statistics
import sys
import tempfile
import types
from collections import Counter
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, Iterator, List, Sequence, Tuple

PROJECT_ROOT = Path(__file__).resolve().parents[2]
BACKEND_ROOT = Path(__file__).resolve().parents[1]

sys.path.insert(0, str(BACKEND_ROOT))

os.environ.setdefault('RATELIMIT_DEFAULT', '100000 per minute')
os.environ.setdefault('CATALOG_MAX_MOVIES', '0')
os.environ.setdefault('MOVIES_DB', str(BACKEND_ROOT / 'app' / 'datasets' / 'movies_core.db'))

TRAITS = [
    'darkness',
    'energy',
    'mood',
    'depth',
    'optimism',
    'novelty',
    'comfort',
    'intensity',
    'humor',
]

@dataclass
class AuditSample:
    profile_id: str
    source: str
    answers: List[float]
    traits: Dict[str, float]
    summary: str
    rec_ids: List[str]
    reasons: List[str]


class DummyBlueprint:
    def __init__(self, *args: Any, **kwargs: Any) -> None:
        pass

    def get(self, *args: Any, **kwargs: Any):
        return lambda fn: fn

    def post(self, *args: Any, **kwargs: Any):
        return lambda fn: fn


class RequestProxy:
    def __init__(self) -> None:
        self.payload: Dict[str, Any] = {}
        self.headers: Dict[str, Any] = {}

    def set(self, payload: Dict[str, Any], headers: Dict[str, Any] | None = None) -> None:
        self.payload = payload
        self.headers = headers or {}

    def get_json(self, silent: bool = False) -> Dict[str, Any]:
        return self.payload



def clamp01(value: float) -> float:
    return max(0.0, min(1.0, float(value)))



def as_trait_map(raw: Any, fallback: Dict[str, float] | None = None) -> Dict[str, float]:
    base = fallback or {key: 0.5 for key in TRAITS}
    if not isinstance(raw, dict):
        return dict(base)
    out: Dict[str, float] = {}
    for key in TRAITS:
        out[key] = clamp01(float(raw.get(key, base.get(key, 0.5))))
    return out



def cosine(a: Sequence[float], b: Sequence[float]) -> float:
    num = sum(x * y for x, y in zip(a, b))
    da = math.sqrt(sum(x * x for x in a)) or 1e-9
    db = math.sqrt(sum(y * y for y in b)) or 1e-9
    return num / (da * db)



def centered_cosine01(a: Sequence[float], b: Sequence[float]) -> float:
    ac = [float(x) - 0.5 for x in a]
    bc = [float(y) - 0.5 for y in b]
    return max(0.0, min(1.0, 0.5 * (cosine(ac, bc) + 1.0)))



def trait_vector(traits: Dict[str, float]) -> List[float]:
    return [clamp01(float(traits.get(key, 0.5))) for key in TRAITS]


TRAIT_REASON_FRAGMENTS: Dict[str, List[str]] = {
    'darkness': ['a darker edge', 'moodier storytelling', 'more shadow and tension'],
    'energy': ['more drive', 'forward momentum', 'a bit more pace'],
    'mood': ['strong atmosphere', 'a more atmospheric feel', 'more mood than noise'],
    'depth': ['real emotional depth', 'something more thoughtful', 'character weight'],
    'optimism': ['some warmth', 'a warmer emotional tone', 'a hopeful streak'],
    'novelty': ['something less predictable', 'fresher ideas', 'a more off-center edge'],
    'comfort': ['a grounded, familiar feel', 'something more settled', 'a comforting sense of familiarity'],
    'intensity': ['stronger tension', 'heavier emotional stakes', 'more intensity'],
    'humor': ['some wit', 'a lighter touch', 'more humor'],
}

TRAIT_REASON_DETAIL_FRAGMENTS: Dict[str, str] = {
    'darkness': 'a darker edge',
    'energy': 'more drive',
    'mood': 'strong atmosphere',
    'depth': 'emotional weight',
    'optimism': 'some warmth',
    'novelty': 'a less predictable edge',
    'comfort': 'a grounded feel',
    'intensity': 'sharper tension',
    'humor': 'some wit',
}

TRAIT_REASON_PAIR_FRAGMENTS: Dict[str, List[str]] = {
    'comfort|depth': [
        'something grounded with real emotional depth',
        'grounded storytelling with emotional weight',
        'something familiar but emotionally rich',
    ],
    'comfort|humor': [
        'an easygoing tone with some wit',
        'something light on its feet and easy to settle into',
        'something comfortable with a lighter touch',
    ],
    'comfort|mood': [
        'something grounded with a strong sense of atmosphere',
        'a familiar tone with more mood in it',
        'something settled but still atmospheric',
    ],
    'comfort|optimism': [
        'warmth without losing that grounded feel',
        'something hopeful and easy to settle into',
        'a warmer tone that still feels familiar',
    ],
    'darkness|depth': [
        'darker storytelling with real emotional depth',
        'something dark but emotionally rich',
        'shadowier material with real weight',
    ],
    'darkness|intensity': [
        'a darker edge with stronger stakes',
        'shadow and tension together',
        'something darker with sharper intensity',
    ],
    'darkness|mood': [
        'moodier storytelling with strong atmosphere',
        'a darker atmosphere that really lingers',
        'shadowier films with a strong sense of mood',
    ],
    'darkness|novelty': [
        'a darker edge with fresher ideas',
        'something shadowy that still feels less obvious',
        'moodier material with a stranger edge',
    ],
    'depth|intensity': [
        'emotional depth with real tension underneath',
        'character weight and sharper stakes together',
        'something thoughtful that still hits hard',
    ],
    'depth|mood': [
        'strong atmosphere with emotional depth',
        'something atmospheric and emotionally rich',
        'mood and character weight together',
    ],
    'depth|novelty': [
        'thoughtful ideas that still feel fresh',
        'something intellectually alive and a little less obvious',
        'emotional depth with a fresher edge',
    ],
    'energy|humor': [
        'livelier pacing with some wit',
        'momentum and a lighter touch together',
        'something brisk with a sense of fun',
    ],
    'energy|intensity': [
        'real momentum with stronger stakes',
        'pace and tension working together',
        'something propulsive with more bite',
    ],
    'energy|novelty': [
        'momentum with a less predictable edge',
        'pace without feeling too obvious',
        'something propulsive and a little fresher',
    ],
    'humor|optimism': [
        'warmth and wit together',
        'something lighter with a genuinely warm tone',
        'a warmer film with a playful side',
    ],
    'mood|novelty': [
        'strong atmosphere with a less predictable edge',
        'something immersive that still feels fresh',
        'mood-first storytelling with stranger turns',
    ],
}

GENRE_REASON_ADDONS: Dict[str, List[str]] = {
    'Action': ['with an action edge', 'through an action frame'],
    'Adventure': ['with an adventurous sweep', 'through an adventure story'],
    'Animation': ['in animated form'],
    'Comedy': ['through a comedy frame', 'with a comic streak'],
    'Crime': ['inside a crime story', 'through a crime lens'],
    'Drama': ['in a character-driven drama', 'through a dramatic lens'],
    'Family': ['in a family-friendly frame'],
    'Fantasy': ['with a fantasy bent', 'through a fantasy world'],
    'History': ['inside a historical story'],
    'Horror': ['with horror undertones', 'through a horror frame'],
    'Mystery': ['inside a mystery', 'with a mystery backbone'],
    'Romance': ['through a romantic angle', 'inside a romance'],
    'Science Fiction': ['through a sci-fi lens', 'in a sci-fi frame'],
    'Thriller': ['with a thriller edge', 'through a thriller setup'],
    'War': ['inside a war story'],
    'Western': ['through a western setting'],
}


def stable_reason_seed(parts: Sequence[Any]) -> int:
    raw = '|'.join(str(part) for part in parts if part not in (None, '')).strip()
    return sum(ord(char) for char in raw)



def pick_stable(items: Sequence[str], seed: int, offset: int = 0) -> str:
    if not items:
        return ''
    return items[(seed + offset) % len(items)]



def normalize_genres(raw: Any) -> List[str]:
    if not isinstance(raw, list):
        return []
    out: List[str] = []
    for item in raw:
        text = str(item or '').strip()
        if text:
            out.append(text)
    return out



def build_reason_core(keys: Sequence[str], seed: int) -> str:
    pair_key = '|'.join(sorted(keys[:2]))
    pair_options = TRAIT_REASON_PAIR_FRAGMENTS.get(pair_key, [])
    if pair_options:
        return pick_stable(pair_options, seed)

    primary = pick_stable(TRAIT_REASON_FRAGMENTS.get(keys[0], []), seed) or 'what you usually respond to'
    secondary = pick_stable(TRAIT_REASON_FRAGMENTS.get(keys[1], []), seed, 1) if len(keys) > 1 else ''
    return f'{primary} with {secondary}' if secondary else primary



def build_reason_detail(keys: Sequence[str], seed: int) -> str:
    if len(keys) < 3:
        return ''
    detail = TRAIT_REASON_DETAIL_FRAGMENTS.get(keys[2], '')
    if not detail:
        return ''
    return pick_stable([f' with {detail}', f', plus {detail}', f', and {detail}'], seed, 3)



def build_genre_addon(movie: Dict[str, Any] | None, seed: int = 0) -> str:
    primary_genre = normalize_genres(movie.get('genre') if isinstance(movie, dict) else None)
    genre_key = primary_genre[0] if primary_genre else ''
    options = GENRE_REASON_ADDONS.get(genre_key, [])
    if not options:
        return ''
    return f" {pick_stable(options, seed, 4)}"



def build_recommendation_reason(user_traits: Dict[str, float], movie: Dict[str, Any] | None) -> str:
    if not movie:
        return ''

    movie_traits = as_trait_map(movie.get('traits'))
    ranked = [
        {
            'key': key,
            'score': min(clamp01(user_traits.get(key, 0.5)), clamp01(movie_traits.get(key, 0.5))) - 0.5,
        }
        for key in TRAITS
    ]
    ranked = [item for item in ranked if item['score'] >= 0.08]
    ranked.sort(key=lambda item: item['score'], reverse=True)

    if ranked:
        top = ranked[:3]
    else:
        top = [
            {
                'key': key,
                'score': min(clamp01(user_traits.get(key, 0.5)), clamp01(movie_traits.get(key, 0.5))),
            }
            for key in TRAITS
        ]
        top.sort(key=lambda item: item['score'], reverse=True)
        top = top[:3]

    keys = [str(item['key']) for item in top]
    if not keys:
        return ''

    seed = stable_reason_seed(
        [
            movie.get('id'),
            movie.get('title'),
            movie.get('year'),
            movie.get('director'),
            '|'.join(normalize_genres(movie.get('genre'))),
            '|'.join(keys),
        ]
    )
    core = build_reason_core(keys, seed)
    detail_addon = build_reason_detail(keys, seed) if len(top) >= 3 and float(top[2].get('score', 0.0)) >= 0.11 else ''
    genre_addon = build_genre_addon(movie, seed) if (not detail_addon or seed % 3 == 0) else ''
    addon = genre_addon or detail_addon

    templates = [
        f'Because it leans into {core}{addon}.',
        f'Because it brings together {core}{addon}.',
        f'Because it matches your taste for {core}{addon}.',
        f'Because it gives you {core}{addon}.',
        f'Because it lands in that sweet spot of {core}{addon}.',
    ]
    return pick_stable(templates, seed, 5) or templates[0]


def beta_like_answers(rng: random.Random) -> List[float]:
    values: List[float] = []
    for _ in TRAITS:
        a = rng.random()
        b = rng.random()
        values.append(round((a + b) / 2.0, 4))
    return values


def corner_profiles(low: float, high: float) -> Iterator[Tuple[str, str, List[float]]]:
    for idx, bits in enumerate(itertools.product([round(low, 4), round(high, 4)], repeat=len(TRAITS))):
        yield (f'corner-{idx:04d}', 'corners', [float(v) for v in bits])


def axis_profiles(values: Sequence[float], center: float = 0.5) -> Iterator[Tuple[str, str, List[float]]]:
    profile_idx = 0
    for trait_idx, trait_name in enumerate(TRAITS):
        for value in values:
            answers = [round(center, 4)] * len(TRAITS)
            answers[trait_idx] = round(float(value), 4)
            yield (f'axis-{profile_idx:04d}', f'axis:{trait_name}', answers)
            profile_idx += 1


def cartesian_profile_from_index(index: int, values: Sequence[float]) -> List[float]:
    base = len(values)
    out = [0.0] * len(TRAITS)
    n = index
    for pos in range(len(TRAITS) - 1, -1, -1):
        n, rem = divmod(n, base)
        out[pos] = round(float(values[rem]), 4)
    return out


def sampled_grid_profiles(values: Sequence[float], limit: int) -> Iterator[Tuple[str, str, List[float]]]:
    total = len(values) ** len(TRAITS)
    if total <= 0:
        return
    if limit <= 0 or limit >= total:
        indices = range(total)
    else:
        step = total / float(limit)
        indices = [min(total - 1, int(math.floor(i * step))) for i in range(limit)]
    seen: set[int] = set()
    out_idx = 0
    for idx in indices:
        if idx in seen:
            continue
        seen.add(idx)
        yield (f'grid-{out_idx:05d}', 'grid', cartesian_profile_from_index(idx, values))
        out_idx += 1


def random_profiles(count: int, seed: int) -> Iterator[Tuple[str, str, List[float]]]:
    rng = random.Random(seed)
    for idx in range(count):
        yield (f'random-{idx:04d}', 'random', beta_like_answers(rng))


def build_profile_stream(args: argparse.Namespace) -> Iterator[Tuple[str, str, List[float]]]:
    if args.include_corners:
        yield from corner_profiles(args.corner_low, args.corner_high)
    if args.axis_values:
        yield from axis_profiles(args.axis_values, center=args.axis_center)
    if args.grid_values:
        yield from sampled_grid_profiles(args.grid_values, args.grid_limit)
    if args.random_samples > 0:
        yield from random_profiles(args.random_samples, args.seed)


def tuple_overlap(left: Sequence[str], right: Sequence[str]) -> float:
    if not left:
        return 0.0
    return len(set(left) & set(right)) / max(1, len(left))


def percentile(values: Sequence[float], p: float) -> float:
    if not values:
        return 0.0
    sorted_vals = sorted(values)
    idx = min(len(sorted_vals) - 1, max(0, int(round((len(sorted_vals) - 1) * p))))
    return sorted_vals[idx]


def mean_or_zero(values: Sequence[float]) -> float:
    return statistics.mean(values) if values else 0.0


def median_or_zero(values: Sequence[float]) -> float:
    return statistics.median(values) if values else 0.0


def db_column_percentile(db_path: str | Path, column: str, p: float) -> float:
    conn = sqlite3.connect(str(db_path))
    cur = conn.cursor()
    total = int(cur.execute('SELECT COUNT(*) FROM movies').fetchone()[0])
    if total <= 0:
        conn.close()
        return 0.0
    idx = min(total - 1, max(0, int(round((total - 1) * p))))
    row = cur.execute(f'SELECT {column} FROM movies ORDER BY {column} LIMIT 1 OFFSET ?', (idx,)).fetchone()
    conn.close()
    return float(row[0]) if row and row[0] is not None else 0.0


def parse_float_list(raw: str | None) -> List[float]:
    if not raw:
        return []
    out: List[float] = []
    for part in raw.split(','):
        part = part.strip()
        if not part:
            continue
        out.append(round(float(part), 4))
    return out


def load_runtime_modules() -> Tuple[RequestProxy, Any, Any, Any]:
    request_proxy = RequestProxy()

    flask_stub = types.ModuleType('flask')
    flask_stub.Blueprint = DummyBlueprint
    flask_stub.jsonify = lambda payload=None, *args, **kwargs: payload
    flask_stub.request = request_proxy
    sys.modules['flask'] = flask_stub

    if 'app' not in sys.modules:
        app_pkg = types.ModuleType('app')
        app_pkg.__path__ = [str(BACKEND_ROOT / 'app')]
        sys.modules['app'] = app_pkg

    for module_name in ['app.main', 'app.catalog_db', 'app.db']:
        sys.modules.pop(module_name, None)

    db_mod = importlib.import_module('app.db')
    catalog_mod = importlib.import_module('app.catalog_db')
    main_mod = importlib.import_module('app.main')
    return request_proxy, db_mod, catalog_mod, main_mod


def run_audit(args: argparse.Namespace) -> Dict[str, Any]:
    with tempfile.TemporaryDirectory(prefix='mindmatch-audit-') as tmpdir:
        os.environ.pop('BANDIT_DB_URL', None)
        os.environ.pop('DB_URL', None)
        os.environ['BANDIT_DB_PATH'] = str(Path(tmpdir) / 'bandit_audit.db')

        movies_db = str(Path(getattr(args, 'movies_db', os.environ.get('MOVIES_DB', str(BACKEND_ROOT / 'app' / 'datasets' / 'movies_core.db')))).resolve())
        os.environ['MOVIES_DB'] = movies_db
        os.environ['CATALOG_MAX_MOVIES'] = '0'
        variant_name = getattr(args, 'variant_name', '') or Path(movies_db).stem
        low_popularity_threshold = getattr(args, 'low_popularity_threshold', None)
        if low_popularity_threshold is None:
            low_popularity_threshold = db_column_percentile(movies_db, 'popularity', 0.25)

        request_proxy, db_mod, catalog_mod, main_mod = load_runtime_modules()
        db_mod._engine = None
        main_mod.init_app(None)

        active_catalog_rows = catalog_mod.count_rows()
        total_catalog_rows = catalog_mod.count_total_rows()

        samples: List[AuditSample] = []
        failures: List[Dict[str, Any]] = []
        movie_titles: Dict[str, str] = {}
        list_counter: Counter[Tuple[str, ...]] = Counter()
        summary_counter: Counter[str] = Counter()
        reason_counter: Counter[str] = Counter()
        top1_counter: Counter[str] = Counter()
        source_counter: Counter[str] = Counter()
        duplicate_id_lists = 0
        duplicate_reason_lists = 0
        displayed_popularities: List[float] = []
        displayed_ratings: List[float] = []
        displayed_vote_counts: List[float] = []
        displayed_fit_scores: List[float] = []

        session_id = args.session_id

        for profile_id, source, answers in build_profile_stream(args):
            payload = {'answers': answers, 'session_id': session_id}
            request_proxy.set(payload, {'X-Session-ID': session_id})
            result = main_mod.recommend()

            status_code = 200
            body: Dict[str, Any] | None
            if isinstance(result, tuple):
                body, status_code = result
            else:
                body = result

            if status_code != 200:
                failures.append(
                    {
                        'profile_id': profile_id,
                        'source': source,
                        'status_code': status_code,
                        'body': body,
                    }
                )
                continue

            body = body or {}
            profile = body.get('profile') or {}
            recs = list((body.get('recommendations') or [])[: args.k])
            traits = as_trait_map(profile.get('traits'), fallback={key: answers[i] for i, key in enumerate(TRAITS)})
            summary = str(profile.get('summary') or '').strip()
            rec_ids: List[str] = []
            reasons: List[str] = []

            for rec in recs:
                movie_id = str(rec.get('id'))
                title = str(rec.get('title') or movie_id)
                year = rec.get('year')
                movie_titles[movie_id] = f'{title} ({year})' if year else title
                rec_ids.append(movie_id)
                reasons.append(build_recommendation_reason(traits, rec))
                displayed_popularities.append(float(rec.get('popularity') or 0.0))
                displayed_ratings.append(float(rec.get('vote_average') or 0.0))
                displayed_vote_counts.append(float(rec.get('vote_count') or 0.0))
                fit_value = rec.get('fit_score', rec.get('match'))
                if fit_value is not None:
                    displayed_fit_scores.append(float(fit_value))

            if len(rec_ids) != len(set(rec_ids)):
                duplicate_id_lists += 1
            nonempty_reasons = [reason for reason in reasons if reason]
            if len(nonempty_reasons) != len(set(nonempty_reasons)):
                duplicate_reason_lists += 1

            list_counter[tuple(rec_ids)] += 1
            summary_counter[summary] += 1
            source_counter[source] += 1
            if rec_ids:
                top1_counter[rec_ids[0]] += 1
            for reason in reasons:
                if reason:
                    reason_counter[reason] += 1

            samples.append(
                AuditSample(
                    profile_id=profile_id,
                    source=source,
                    answers=list(answers),
                    traits=traits,
                    summary=summary,
                    rec_ids=rec_ids,
                    reasons=reasons,
                )
            )

        unique_movie_ids = {movie_id for sample in samples for movie_id in sample.rec_ids}
        unique_top1_ids = set(top1_counter.keys())
        unique_lists = len(list_counter)
        unique_summaries = len([summary for summary in summary_counter if summary])
        unique_reasons = len(reason_counter)
        total_reason_strings = sum(len(sample.reasons) for sample in samples)
        total_profiles = len(samples)

        pair_rng = random.Random(args.seed + 17)
        dissimilar_pairs = 0
        dissimilar_overlaps: List[float] = []
        dissimilar_jaccards: List[float] = []
        dissimilar_same_lists = 0
        dissimilar_same_summaries = 0
        dissimilar_same_reason_sets = 0
        dissimilar_with_any_overlap = 0

        if len(samples) >= 2:
            trait_vectors = [trait_vector(sample.traits) for sample in samples]
            for _ in range(args.pair_samples):
                i, j = pair_rng.sample(range(len(samples)), 2)
                sim = centered_cosine01(trait_vectors[i], trait_vectors[j])
                if sim > args.dissimilar_sim_max:
                    continue
                dissimilar_pairs += 1
                left = samples[i]
                right = samples[j]
                overlap = tuple_overlap(left.rec_ids, right.rec_ids)
                union = len(set(left.rec_ids) | set(right.rec_ids)) or 1
                jaccard = len(set(left.rec_ids) & set(right.rec_ids)) / union
                dissimilar_overlaps.append(overlap)
                dissimilar_jaccards.append(jaccard)
                if overlap > 0:
                    dissimilar_with_any_overlap += 1
                if left.rec_ids == right.rec_ids:
                    dissimilar_same_lists += 1
                if left.summary and left.summary == right.summary:
                    dissimilar_same_summaries += 1
                if tuple(left.reasons) == tuple(right.reasons):
                    dissimilar_same_reason_sets += 1

        top_movies = Counter(movie_id for sample in samples for movie_id in sample.rec_ids).most_common(args.report_top_n)
        top_movie_rows = [
            {
                'movie_id': movie_id,
                'title': movie_titles.get(movie_id, movie_id),
                'count': count,
            }
            for movie_id, count in top_movies
        ]

        top_summary_rows = [
            {'summary': text, 'count': count}
            for text, count in summary_counter.most_common(args.report_top_n)
            if text
        ]

        top_reason_rows = [
            {'reason': text, 'count': count}
            for text, count in reason_counter.most_common(args.report_top_n)
            if text
        ]

        top_list_rows = []
        for list_key, count in list_counter.most_common(args.report_top_n):
            top_list_rows.append(
                {
                    'count': count,
                    'movie_ids': list(list_key),
                    'titles': [movie_titles.get(movie_id, movie_id) for movie_id in list_key],
                }
            )

        report = {
            'catalog': {
                'variant_name': variant_name,
                'active_rows': active_catalog_rows,
                'total_rows': total_catalog_rows,
                'movies_db': os.environ.get('MOVIES_DB'),
            },
            'profiles': {
                'requested': sum(source_counter.values()) + len(failures),
                'successful': total_profiles,
                'failed': len(failures),
                'source_breakdown': dict(source_counter),
                'k': args.k,
                'session_id': session_id,
            },
            'repetition': {
                'within_list_duplicate_id_lists': duplicate_id_lists,
                'unique_recommendation_lists': unique_lists,
                'duplicate_list_rate': (1.0 - (unique_lists / total_profiles)) if total_profiles else 0.0,
                'unique_recommended_movies': len(unique_movie_ids),
                'catalog_coverage': (len(unique_movie_ids) / active_catalog_rows) if active_catalog_rows else 0.0,
                'unique_top1_movies': len(unique_top1_ids),
                'top1_concentration': (top1_counter.most_common(1)[0][1] / total_profiles) if top1_counter and total_profiles else 0.0,
                'top_movies': top_movie_rows,
                'top_lists': top_list_rows,
            },
            'copy': {
                'unique_summaries': unique_summaries,
                'summary_duplicate_rate': (1.0 - (unique_summaries / total_profiles)) if total_profiles else 0.0,
                'unique_reason_strings': unique_reasons,
                'reason_duplicate_rate': (1.0 - (unique_reasons / total_reason_strings)) if total_reason_strings else 0.0,
                'within_list_duplicate_reason_lists': duplicate_reason_lists,
                'top_summaries': top_summary_rows,
                'top_reasons': top_reason_rows,
            },
            'display_metrics': {
                'low_popularity_threshold': float(low_popularity_threshold),
                'mean_displayed_popularity': mean_or_zero(displayed_popularities),
                'median_displayed_popularity': median_or_zero(displayed_popularities),
                'low_popularity_result_rate': (sum(1 for value in displayed_popularities if value < float(low_popularity_threshold)) / len(displayed_popularities)) if displayed_popularities else 0.0,
                'mean_displayed_rating': mean_or_zero(displayed_ratings),
                'median_displayed_rating': median_or_zero(displayed_ratings),
                'mean_displayed_vote_count': mean_or_zero(displayed_vote_counts),
                'median_displayed_vote_count': median_or_zero(displayed_vote_counts),
                'mean_displayed_fit': mean_or_zero(displayed_fit_scores),
                'median_displayed_fit': median_or_zero(displayed_fit_scores),
            },
            'dissimilar_overlap': {
                'pair_samples': args.pair_samples,
                'sim_max': args.dissimilar_sim_max,
                'eligible_pairs': dissimilar_pairs,
                'mean_overlap_at_k': statistics.mean(dissimilar_overlaps) if dissimilar_overlaps else 0.0,
                'p90_overlap_at_k': percentile(dissimilar_overlaps, 0.90),
                'mean_jaccard': statistics.mean(dissimilar_jaccards) if dissimilar_jaccards else 0.0,
                'share_with_any_overlap': (dissimilar_with_any_overlap / dissimilar_pairs) if dissimilar_pairs else 0.0,
                'identical_list_rate': (dissimilar_same_lists / dissimilar_pairs) if dissimilar_pairs else 0.0,
                'identical_summary_rate': (dissimilar_same_summaries / dissimilar_pairs) if dissimilar_pairs else 0.0,
                'identical_reason_set_rate': (dissimilar_same_reason_sets / dissimilar_pairs) if dissimilar_pairs else 0.0,
            },
            'failures': failures[: args.report_top_n],
        }

        engine = getattr(db_mod, '_engine', None)
        if engine is not None:
            engine.dispose()
            db_mod._engine = None

        return report


def print_report(report: Dict[str, Any]) -> None:
    catalog = report['catalog']
    profiles = report['profiles']
    repetition = report['repetition']
    copy = report['copy']
    display = report['display_metrics']
    overlap = report['dissimilar_overlap']

    print('=== MindMatch Recommendation Audit ===')
    print(
        f"profiles requested={profiles['requested']} successful={profiles['successful']} "
        f"failed={profiles['failed']} k={profiles['k']}"
    )
    print(
        f"variant={catalog['variant_name']} active_rows={catalog['active_rows']} total_rows={catalog['total_rows']} "
        f"unique_recommended={repetition['unique_recommended_movies']} "
        f"coverage={repetition['catalog_coverage']:.4f}"
    )
    print(
        f"unique_lists={repetition['unique_recommendation_lists']} "
        f"duplicate_list_rate={repetition['duplicate_list_rate']:.4f} "
        f"within_list_duplicate_ids={repetition['within_list_duplicate_id_lists']}"
    )
    print(
        f"unique_top1={repetition['unique_top1_movies']} "
        f"top1_concentration={repetition['top1_concentration']:.4f}"
    )
    print(
        f"unique_summaries={copy['unique_summaries']} "
        f"summary_duplicate_rate={copy['summary_duplicate_rate']:.4f}"
    )
    print(
        f"unique_reason_strings={copy['unique_reason_strings']} "
        f"reason_duplicate_rate={copy['reason_duplicate_rate']:.4f} "
        f"within_list_duplicate_reasons={copy['within_list_duplicate_reason_lists']}"
    )
    print(
        f"mean_popularity={display['mean_displayed_popularity']:.4f} "
        f"median_popularity={display['median_displayed_popularity']:.4f} "
        f"low_pop_rate={display['low_popularity_result_rate']:.4f} "
        f"(threshold<{display['low_popularity_threshold']:.4f})"
    )
    print(
        f"mean_rating={display['mean_displayed_rating']:.4f} "
        f"median_rating={display['median_displayed_rating']:.4f} "
        f"mean_fit={display['mean_displayed_fit']:.4f}"
    )
    print(
        f"dissimilar_pairs={overlap['eligible_pairs']} "
        f"mean_overlap@k={overlap['mean_overlap_at_k']:.4f} "
        f"p90_overlap@k={overlap['p90_overlap_at_k']:.4f} "
        f"any_overlap_rate={overlap['share_with_any_overlap']:.4f} "
        f"identical_list_rate={overlap['identical_list_rate']:.4f}"
    )

    if repetition['top_movies']:
        print('\nTop repeated movies:')
        for row in repetition['top_movies']:
            print(f"- {row['title']} [{row['movie_id']}] x{row['count']}")

    if copy['top_summaries']:
        print('\nTop repeated summaries:')
        for row in copy['top_summaries']:
            print(f"- x{row['count']}: {row['summary']}")

    if copy['top_reasons']:
        print('\nTop repeated reasons:')
        for row in copy['top_reasons']:
            print(f"- x{row['count']}: {row['reason']}")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--k', type=int, default=4, help='Top-k recommendations to audit per profile.')
    parser.add_argument('--seed', type=int, default=42, help='Random seed for profile sampling and pair sampling.')
    parser.add_argument('--random-samples', type=int, default=600, help='Number of random realistic profiles to test.')
    parser.add_argument('--include-corners', action='store_true', help='Include all 2^9 low/high corner profiles.')
    parser.add_argument('--corner-low', type=float, default=0.12, help='Low value for corner profiles.')
    parser.add_argument('--corner-high', type=float, default=0.88, help='High value for corner profiles.')
    parser.add_argument(
        '--axis-values',
        type=str,
        default='0.12,0.3,0.5,0.7,0.88',
        help='Comma-separated values for one-trait-at-a-time sweeps. Empty string disables axis sweeps.',
    )
    parser.add_argument('--axis-center', type=float, default=0.5, help='Center value for non-swept axis profiles.')
    parser.add_argument(
        '--grid-values',
        type=str,
        default='',
        help='Optional comma-separated discrete grid values for 9D cartesian sampling. Empty disables grid profiles.',
    )
    parser.add_argument(
        '--grid-limit',
        type=int,
        default=0,
        help='If grid values are provided, cap the number of sampled grid profiles. 0 means full discrete grid.',
    )
    parser.add_argument('--pair-samples', type=int, default=5000, help='How many random profile pairs to inspect.')
    parser.add_argument(
        '--dissimilar-sim-max',
        type=float,
        default=0.42,
        help='Max centered-cosine similarity to treat two profiles as dissimilar.',
    )
    parser.add_argument('--report-top-n', type=int, default=10, help='How many repeated items to print in summaries.')
    parser.add_argument('--session-id', type=str, default='audit-baseline', help='Shared session id used for the audit.')
    parser.add_argument('--movies-db', type=str, default=str(BACKEND_ROOT / 'app' / 'datasets' / 'movies_core.db'), help='Catalog DB to audit against.')
    parser.add_argument('--variant-name', type=str, default='', help='Optional label for the audited catalog variant.')
    parser.add_argument('--low-popularity-threshold', type=float, default=None, help='Optional fixed popularity threshold used for low-popularity result rate.')
    parser.add_argument('--json-out', type=str, default='', help='Optional path to write the full audit report as JSON.')
    args = parser.parse_args()

    args.axis_values = parse_float_list(args.axis_values)
    args.grid_values = parse_float_list(args.grid_values)

    report = run_audit(args)
    print_report(report)

    if args.json_out:
        out_path = Path(args.json_out)
        out_path.parent.mkdir(parents=True, exist_ok=True)
        out_path.write_text(json.dumps(report, indent=2), encoding='utf-8')
        print(f'\nJSON report written to {out_path}')

    return 0 if report['profiles']['successful'] > 0 else 1


if __name__ == '__main__':
    raise SystemExit(main())


