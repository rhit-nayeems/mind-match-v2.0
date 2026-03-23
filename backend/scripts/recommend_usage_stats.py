#!/usr/bin/env python3
"""Print simple usage stats for backend recommendation traffic."""

from __future__ import annotations

import argparse
import json
import os
import sqlite3
from pathlib import Path
from typing import Any, Dict, List


def resolve_db_url() -> str:
    url = os.environ.get('BANDIT_DB_URL') or os.environ.get('DB_URL')
    if url:
        return url

    path = os.environ.get('BANDIT_DB_PATH')
    if not path:
        path = str(Path(__file__).resolve().parents[1] / 'app' / 'datasets' / 'bandit.db')
    return f'sqlite:///{path}'


def resolve_sqlite_path(db_url: str) -> Path:
    if not db_url.startswith('sqlite:///'):
        raise RuntimeError(
            'recommend_usage_stats.py currently supports SQLite event DBs only. '
            f'Current DB URL: {db_url}'
        )
    return Path(db_url.removeprefix('sqlite:///')).resolve()


def collect_stats(db_path: Path, event_type: str, days: int) -> Dict[str, Any]:
    conn = sqlite3.connect(str(db_path))
    conn.row_factory = sqlite3.Row
    try:
        total = conn.execute(
            'SELECT COUNT(*) AS c FROM events WHERE type = ?',
            (event_type,),
        ).fetchone()['c']
        unique_sessions = conn.execute(
            'SELECT COUNT(DISTINCT session_id) AS c FROM events WHERE type = ?',
            (event_type,),
        ).fetchone()['c']
        latest_at = conn.execute(
            'SELECT MAX(at) AS latest_at FROM events WHERE type = ?',
            (event_type,),
        ).fetchone()['latest_at']
        daily_rows = conn.execute(
            """
            SELECT DATE(at) AS day,
                   COUNT(*) AS request_count,
                   COUNT(DISTINCT session_id) AS unique_sessions
            FROM events
            WHERE type = ?
            GROUP BY DATE(at)
            ORDER BY day DESC
            LIMIT ?
            """,
            (event_type, max(1, int(days))),
        ).fetchall()
        daily: List[Dict[str, Any]] = [
            {
                'day': str(row['day']),
                'request_count': int(row['request_count'] or 0),
                'unique_sessions': int(row['unique_sessions'] or 0),
            }
            for row in daily_rows
        ]
        return {
            'db_path': str(db_path),
            'event_type': event_type,
            'total_requests': int(total or 0),
            'unique_sessions': int(unique_sessions or 0),
            'latest_request_at': latest_at,
            'daily': daily,
        }
    finally:
        conn.close()


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--event-type', default='recommend_served', help='Event type to summarize. Default: recommend_served')
    parser.add_argument('--days', type=int, default=14, help='How many recent day buckets to print. Default: 14')
    parser.add_argument('--json', action='store_true', help='Print JSON instead of plain text.')
    args = parser.parse_args()

    db_url = resolve_db_url()
    db_path = resolve_sqlite_path(db_url)
    if not db_path.exists():
        stats = {
            'db_path': str(db_path),
            'event_type': args.event_type,
            'total_requests': 0,
            'unique_sessions': 0,
            'latest_request_at': None,
            'daily': [],
            'note': 'Event DB not found yet. Deploy and generate traffic first.',
        }
    else:
        stats = collect_stats(db_path=db_path, event_type=args.event_type, days=args.days)

    if args.json:
        print(json.dumps(stats, indent=2))
        return 0

    print('=== MindMatch Usage Stats ===')
    print(f"DB: {stats['db_path']}")
    print(f"Event type: {stats['event_type']}")
    print(f"Total recommendation runs: {stats['total_requests']}")
    print(f"Unique sessions: {stats['unique_sessions']}")
    print(f"Latest request at: {stats['latest_request_at'] or 'n/a'}")
    if stats.get('note'):
        print(f"Note: {stats['note']}")
    print('Recent daily counts:')
    if not stats['daily']:
        print('- no events logged yet')
        return 0

    for row in stats['daily']:
        print(f"- {row['day']}: {row['request_count']} runs, {row['unique_sessions']} unique sessions")
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
