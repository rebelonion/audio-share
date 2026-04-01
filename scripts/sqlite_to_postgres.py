#!/usr/bin/env python3
"""
Migrate audio-share data from SQLite to PostgreSQL.

Copies all rows from every table while preserving IDs (so foreign keys remain
valid) and resets Postgres sequences afterwards.

Dependencies:
    pip install psycopg2-binary

Usage:
    python sqlite_to_postgres.py [sqlite_path] [postgres_url]

Defaults:
    sqlite_path  ./audio-share.db
    postgres_url postgres://audio_share:audio_share@localhost:5432/audio_share

The script is safe to re-run: it skips rows whose primary key already exists in
Postgres (ON CONFLICT DO NOTHING). Run with --clear to truncate all tables first.
"""

import argparse
import sqlite3
import sys
from datetime import timezone

try:
    import psycopg2
    import psycopg2.extras
except ImportError:
    print("ERROR: psycopg2 is required.  Install it with:  pip install psycopg2-binary")
    sys.exit(1)


# Tables in dependency order (parents before children).
# Each entry: (table_name, [columns...])
TABLES = [
    (
        "folders",
        [
            "id", "path", "parent_path", "folder_name", "name", "original_url",
            "url_broken", "item_count", "directory_size", "poster_image",
            "modified_at", "indexed_at", "share_key",
        ],
    ),
    (
        "audio_files",
        [
            "id", "path", "parent_path", "filename", "size", "mime_type",
            "modified_at", "title", "meta_artist", "upload_date", "webpage_url",
            "description", "indexed_at", "downloaded_at", "source_path",
            "thumbnail", "share_key", "deleted",
        ],
    ),
    (
        "play_events",
        ["id", "audio_file_id", "played_at"],
    ),
    (
        "source_requests",
        [
            "id", "submitted_url", "title", "status", "tags", "folder_share_key",
            "created_at", "updated_at",
        ],
    ),
    (
        "waveform_cache",
        ["id", "audio_file_id", "peaks", "generated_at"],
    ),
]


def check_sqlite_tables(sqlite_cur):
    """Return the set of table names that actually exist in the SQLite DB."""
    sqlite_cur.execute("SELECT name FROM sqlite_master WHERE type='table'")
    return {row[0] for row in sqlite_cur.fetchall()}


def check_postgres_empty(pg_cur, table):
    pg_cur.execute(f"SELECT 1 FROM {table} LIMIT 1")
    return pg_cur.fetchone() is None


def clear_tables(pg_cur):
    """Truncate all tables in reverse dependency order and restart sequences."""
    print("Clearing existing Postgres data...")
    for table, _ in reversed(TABLES):
        pg_cur.execute(f"TRUNCATE TABLE {table} RESTART IDENTITY CASCADE")
        print(f"  truncated {table}")


def migrate_table(sqlite_cur, pg_cur, table, columns, batch_size=500):
    # Check which columns actually exist in SQLite (schema may be older).
    sqlite_cur.execute(f"PRAGMA table_info({table})")
    existing_cols = {row[1] for row in sqlite_cur.fetchall()}
    cols = [c for c in columns if c in existing_cols]

    col_list = ", ".join(cols)

    sqlite_cur.execute(f"SELECT {col_list} FROM {table}")

    inserted = 0
    skipped = 0
    batch = []

    def flush(batch):
        nonlocal inserted, skipped
        if not batch:
            return
        # Use execute_values for bulk insert; ON CONFLICT DO NOTHING skips
        # rows that already exist (safe for re-runs).
        psycopg2.extras.execute_values(
            pg_cur,
            f"INSERT INTO {table} ({col_list}) VALUES %s ON CONFLICT DO NOTHING",
            batch,
        )
        # Rows affected tells us how many were actually inserted.
        inserted += pg_cur.rowcount
        skipped += len(batch) - pg_cur.rowcount

    while True:
        rows = sqlite_cur.fetchmany(batch_size)
        if not rows:
            break
        batch.extend(rows)
        if len(batch) >= batch_size:
            flush(batch)
            batch = []

    flush(batch)
    return inserted, skipped


def reset_sequence(pg_cur, table):
    """Advance the BIGSERIAL sequence past the max existing id."""
    pg_cur.execute(
        f"SELECT setval(pg_get_serial_sequence('{table}', 'id'), COALESCE(MAX(id), 0) + 1, false)"
        f" FROM {table}"
    )


def main():
    parser = argparse.ArgumentParser(description="Migrate audio-share SQLite → Postgres")
    parser.add_argument("sqlite_path", nargs="?", default="./audio-share.db")
    parser.add_argument(
        "postgres_url",
        nargs="?",
        default="postgres://audio_share:audio_share@localhost:5432/audio_share",
    )
    parser.add_argument(
        "--clear",
        action="store_true",
        help="Truncate all Postgres tables before migrating (use with caution)",
    )
    args = parser.parse_args()

    print(f"Source : {args.sqlite_path}")
    print(f"Target : {args.postgres_url}")
    print()

    sqlite_con = sqlite3.connect(args.sqlite_path)
    sqlite_con.row_factory = sqlite3.Row
    sqlite_cur = sqlite_con.cursor()

    try:
        pg_con = psycopg2.connect(args.postgres_url)
    except psycopg2.OperationalError as e:
        print(f"ERROR: Could not connect to Postgres: {e}")
        sys.exit(1)

    pg_cur = pg_con.cursor()

    existing_tables = check_sqlite_tables(sqlite_cur)

    try:
        if args.clear:
            clear_tables(pg_cur)
            pg_con.commit()
        else:
            # Warn if any table already has data.
            for table, _ in TABLES:
                if table in existing_tables and not check_postgres_empty(pg_cur, table):
                    print(
                        f"WARNING: {table} already has rows in Postgres.\n"
                        f"  Duplicate primary keys will be skipped automatically.\n"
                        f"  Use --clear to start fresh.\n"
                    )
                    break

        total_inserted = 0
        total_skipped = 0

        for table, columns in TABLES:
            if table not in existing_tables:
                print(f"  {table}: not found in SQLite, skipping")
                continue

            sqlite_cur2 = sqlite_con.cursor()
            sqlite_cur2.row_factory = None  # plain tuples for psycopg2
            inserted, skipped = migrate_table(sqlite_cur2, pg_cur, table, columns)
            reset_sequence(pg_cur, table)
            total_inserted += inserted
            total_skipped += skipped
            print(f"  {table}: {inserted} inserted, {skipped} skipped")

        pg_con.commit()

    except Exception:
        pg_con.rollback()
        raise
    finally:
        sqlite_con.close()
        pg_cur.close()
        pg_con.close()

    print(f"\nDone. {total_inserted} rows inserted, {total_skipped} skipped.")


if __name__ == "__main__":
    main()
