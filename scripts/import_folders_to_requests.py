#!/usr/bin/env python3
"""
Import folders with an original_url into source_requests as 'added' items.
Skips folders whose submitted_url already exists in source_requests.

Usage: python import_folders_to_requests.py [db_path]
Default db_path: ./audio-share.db
"""

import json
import sqlite3
import sys
from datetime import datetime, timezone

YOUTUBE_TAG = {'name': 'YouTube', 'color': '#ff0000'}
TWITCH_TAG  = {'name': 'Twitch',  'color': '#9146ff'}

def tag_for(url: str) -> dict | None:
    if 'youtube.com' in url or 'youtu.be' in url:
        return YOUTUBE_TAG
    if 'twitch.tv' in url:
        return TWITCH_TAG
    return None

def main():
    db_path = sys.argv[1] if len(sys.argv) > 1 else './audio-share.db'
    now = datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')

    with sqlite3.connect(db_path) as con:
        con.row_factory = sqlite3.Row

        folders = con.execute(
            'SELECT name, original_url, share_key, modified_at FROM folders WHERE original_url IS NOT NULL AND original_url != ""'
        ).fetchall()

        if not folders:
            print('No folders with original_url found.')
            return

        existing = {
            row[0] for row in con.execute('SELECT submitted_url FROM source_requests')
        }

        inserted = 0
        skipped = 0

        for folder in folders:
            url = folder['original_url']

            if url in existing:
                print(f'  skip (already exists): {folder["name"]}')
                skipped += 1
                continue

            tag = tag_for(url)
            tags = [tag] if tag else []

            con.execute(
                '''INSERT INTO source_requests
                   (submitted_url, title, status, tags, folder_share_key, created_at, updated_at)
                   VALUES (?, ?, 'added', ?, ?, ?, ?)''',
                (url, folder['name'], json.dumps(tags), folder['share_key'], folder['modified_at'] or now, now),
            )
            existing.add(url)
            print(f'  added: {folder["name"]} ({url})')
            inserted += 1

        con.commit()
    print(f'\nDone. {inserted} inserted, {skipped} skipped.')

if __name__ == '__main__':
    main()
