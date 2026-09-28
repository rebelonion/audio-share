# Management

Use this guide after completing [setup](setup.md). Docker commands assume you are in the repository root. The [configuration reference](configuration.md) lists environment variables and defaults.

## Applying configuration changes

After editing `.env.local` or the Compose configuration, recreate the app and worker:

```bash
docker compose --env-file .env.local up -d app worker
```

A container restart alone does not load changed environment values. For a deployment without Docker, restart both processes with the updated environment.

## Indexing the library

Reindex after adding audio or changing file and folder metadata:

```bash
docker compose --env-file .env.local exec app ./audio-share-backend reindex
```

The index in PostgreSQL powers browsing, search, and library stats. Reindexing reads configured audio directories, `.info.json` files, and `folder.json` files.

A database lock prevents concurrent reindex jobs across containers. If a scheduled reindex is already running, a manual command exits without starting another scan.

Without Docker, run `go run . reindex` from `backend/` with the same database and library configuration as the server.

## Generating waveforms

Generate missing waveforms after indexing:

```bash
docker compose --env-file .env.local exec app ./audio-share-backend waveform
```

The job processes tracks without waveform data, starting with the most recently downloaded. It stops dispatching work after the `WAVEFORM_MAX_DURATION` budget (two hours by default), then waits for in-flight work to finish; this is not a hard timeout. Later runs continue processing the backlog. `WAVEFORM_WORKERS` controls concurrency (one by default), and a database lock prevents overlapping waveform jobs. To allow four hours for one run:

```bash
docker compose --env-file .env.local exec -e WAVEFORM_MAX_DURATION=4h app ./audio-share-backend waveform
```

Waveforms are stored in PostgreSQL. Tracks without waveform data use a plain progress bar and remain playable. The Docker image includes `ffmpeg` and `ffprobe`; install both for a deployment without Docker, then run `go run . waveform` from `backend/`.

## Scheduled jobs

Set these in `.env.local` to reindex every six hours and generate waveforms nightly at 3 a.m. in the worker's time zone:

```env
INDEX_SCHEDULE=0 */6 * * *
WAVEFORM_CRON=0 3 * * *
WAVEFORM_MAX_DURATION=2h
```

Apply the configuration changes to both app and worker. Blank schedules disable the corresponding automatic job. The worker also cleans up playback access-key claims every 15 minutes and processes enabled error alerts every 30 seconds. The web server does not execute scheduled jobs; the worker must be running. In a deployment without Docker, use the separate worker command in [setup](setup.md#running-without-docker).

## Library health and logs

Set `REQUESTS_API_KEY`, apply the configuration, then open `/admin` and enter the key. The dashboard shows waveform coverage and backlog, media identity conflicts, recent error reports, and index/waveform job history. It also provides commands for manual maintenance after fixing affected files.

You stay signed in for 8 hours by default, including across page refreshes. Set `ADMIN_SESSION_TTL` to change this duration, or click “Lock dashboard” to sign out. Use HTTPS when accessing the dashboard outside localhost.

Use Requests to create, edit, update the status of, or delete source requests. Audio lets you mark source-linked tracks as unavailable or requested for removal. Messages sends a note to a known session ID.

The Health section refreshes every 30 seconds while visible. Its schedules reflect the web server's configuration, so keep the worker's configuration in sync. Job history is collected even when ntfy error reporting is disabled.

Inspect service status and logs with:

```bash
docker compose --env-file .env.local ps
docker compose --env-file .env.local logs --tail=100 app worker migrate
```

The app exposes `/ready` for readiness checks. The internal management listener defaults to `127.0.0.1:9090`; do not publish it or forward it through a public reverse proxy.

### Error notifications

Set `NTFY_URL`, `NTFY_TOKEN`, and `NTFY_ERROR_TOPIC` to enable operational error reporting and worker-delivered alerts. A blank error topic disables error reporting. The token must be allowed to publish to that topic.

Use `ERROR_REPORT_WINDOW`, `ERROR_ALERT_COOLDOWN`, and the `ERROR_*_THRESHOLD` settings to control alert frequency. See the [environment reference](configuration.md#server-environment-variables) for defaults. `NTFY_TOPIC` is the separate topic for visitor requests and contact notifications.

## Database migrations

Run migrations before starting a server or worker that requires a newer schema. Docker Compose runs its migration service before starting the app and worker. For a deployment without Docker, run this from `backend/`:

```bash
go run . migrate
```

The server and worker check the database schema at startup. If either reports a schema mismatch, check migration logs and confirm all processes use the intended database.

## Stream and download limits

Key limits use rolling windows. Every configured window must permit a new key:

```env
STREAM_KEY_LIMITS=2/1m,10/1h,20/24h
DOWNLOAD_KEY_LIMITS=1/1m,5/1h,10/24h
DOWNLOAD_SESSION_MIN_AGE=5m
```

Limits apply independently to the signed browser session and client IP, so replacing a session does not reset the IP allowance. `DOWNLOAD_SESSION_MIN_AGE` delays downloads until the signed session reaches the configured age; `0s` disables the delay.

One key covers a logical playback or download. Browser Range requests using that key do not consume additional key allowances. Key-limit state and aggregate IP bandwidth limits are held in memory and are not shared between app replicas.

### Bandwidth

`STREAM_BYTES_PER_SECOND` and `DOWNLOAD_BYTES_PER_SECOND` set per-response speed limits. Their matching `*_BURST_BYTES` settings allow an initial burst and refill at the configured rate.

`STREAM_IP_BYTES_PER_SECOND` and `DOWNLOAD_IP_BYTES_PER_SECOND` share an allowance across concurrent responses from one IP. The shared bucket capacity is the larger of one second at that IP rate or the corresponding per-response burst. A zero rate disables that limit. A zero per-response burst removes the initial burst while keeping any configured rate limit active.

For challenges before issuing access keys, see [Cap setup](setup.md#optional-cap-captcha).

## Takedowns

Use `PATCH /api/admin/audio/{shareKey}/removal-request` to set or clear a track's removal flag. This updates the database without deleting audio or metadata from disk and takes effect without a reindex or restart.

Set `REQUESTS_API_KEY` in your shell to the server's configured admin key. All requests below authenticate through the `X-API-Key` header; replace localhost with your server URL when managing a remote deployment.

### Find the track

The share key is the final segment of a track's `/share/{shareKey}` link. You can also list indexed tracks with original source URLs:

```bash
curl -sS http://localhost:8080/api/admin/audio/sources \
  -H "X-API-Key: $REQUESTS_API_KEY"
```

The response is a JSON array containing `shareKey`, `webpageUrl`, `filename`, an optional `title`, `unavailableAt`, and `removalRequestedAt`. A null `removalRequestedAt` means no removal flag is set. This endpoint only lists non-deleted tracks with a nonempty `webpage_url`; for other tracks, use the share link.

### Apply a takedown

Replace `track-share-key` with the track's share key:

```bash
curl -i -X PATCH http://localhost:8080/api/admin/audio/track-share-key/removal-request \
  -H "X-API-Key: $REQUESTS_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"removalRequested":true}'
```

A successful update returns HTTP 200 with `{"success":true}`. The track is hidden from external browse and search results, and new external stream/download requests return HTTP 410 with `{"error":"removal_requested"}`. An already-running response is not terminated by this update.

Local access remains available: the server treats a request as local when both its immediate peer and resolved client IP are loopback, private, or link-local addresses. Verify public blocking from an external client, rather than localhost or your LAN. Behind a reverse proxy, ensure it supplies the actual visitor IP in the forwarded client-IP headers so external visitors are classified correctly.

### Clear a takedown

Use the same endpoint with `false`:

```bash
curl -i -X PATCH http://localhost:8080/api/admin/audio/track-share-key/removal-request \
  -H "X-API-Key: $REQUESTS_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"removalRequested":false}'
```

This clears `removalRequestedAt` and removes the restriction. Playback still requires the underlying audio file to be available. You can confirm the flag through the sources endpoint for tracks listed there.

Both updates return HTTP 401 if the admin key is missing, incorrect, or not configured; HTTP 404 if the share key does not match a non-deleted track; and HTTP 400 for malformed JSON. Always include the explicit `removalRequested` boolean: an omitted field currently defaults to `false`.

The separate `PATCH /api/admin/audio/{shareKey}/unavailable` endpoint, with `{"unavailable":true}` or `false`, records source unavailability. Use the removal-request endpoint to restrict public access.

## Targeted messages

To send a message to a known anonymous session, set `REQUESTS_API_KEY` in your shell to the server's configured admin key, replace the example session ID, and run:

```bash
curl -X POST http://localhost:8080/api/admin/targeted-messages \
  -H "X-API-Key: $REQUESTS_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "sessionId": "0123456789abcdef0123456789abcdef",
    "title": "A note for you",
    "message": "Please get in touch through the contact page."
  }'
```

Each session can have one pending message, shown on app load until the server processes a dismissal. Multiple tabs may show it. Repeated dismissals cannot delete a newer message; a failed acknowledgement may still have reached the server, so redelivery is not guaranteed.

## Library stats

The `/stats` page reads from the library index without external scripts or static JSON files. Audio counts by day use the download timestamp in each file's `epoch` field. Source counts use the earliest download date for files in a source folder.

A folder is a source when its `folder.json` entry has an `original_url`. Files in that folder and its subfolders are attributed to the nearest ancestor source folder, so a nested folder with its own `original_url` becomes a separate source. If stats are missing, check the [metadata](setup.md#library-metadata) and reindex.

Total listening duration and duration buckets come from generated waveforms, so their coverage grows as waveform jobs complete. Publication-year counts use `upload_date`, falling back to file modification dates when metadata omits it.
