# Configuration

Use [.env.local.example](../.env.local.example) as a starting point. See [setup](setup.md) for installation and [management](management.md#applying-configuration-changes) for applying configuration changes.

## Server environment variables

The table below lists server environment variables and their application defaults. Compose overrides some defaults; its host paths, image, database credentials, and Cap settings are listed in the [Compose variables](#compose-variables). Frontend config is injected at runtime, so you can use a pre-built Docker image with different settings.

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Server port | `8080` |
| `AUDIO_DIR` | Audio directories (format: `/path:Name,/path2:Name2`) | `./public/audio:Audio`; Compose: `/audio:Audio` |
| `SESSION_SECRET` | Required secret used to sign anonymous/admin sessions and media access keys | - |
| `REQUESTS_API_KEY` | Admin login credential; scripts can supply it in `X-API-Key` for `/api/admin` operations | - |
| `ADMIN_SESSION_TTL` | How long admins stay signed in (e.g. `30m`, `8h`, `24h`); whole seconds, minimum `1s` | `8h` |
| `STREAM_KEY_LIMITS` | Rolling per-session and per-IP stream-key limits in `count/duration` format, comma-separated | `10/1m` |
| `DOWNLOAD_KEY_LIMITS` | Rolling per-session and per-IP download-key limits in `count/duration` format, comma-separated | `10/1m` |
| `STREAM_KEY_TTL` | Lifetime of a stream access key | `30m` |
| `DOWNLOAD_KEY_TTL` | Lifetime of a download access key | `10m` |
| `DOWNLOAD_SESSION_MIN_AGE` | Minimum age of a signed anonymous session before it may request download keys (`0s` disables) | `0s` |
| `CAP_ENFORCEMENT` | Cap rollout mode: `off`, `observe`, or `enforce` | `off` |
| `CAP_PUBLIC_ENDPOINT` | Browser-facing Cap endpoint including the site key, ending in `/` | - |
| `CAP_VERIFY_ENDPOINT` | Server-facing `<site-key>/siteverify` endpoint | - |
| `CAP_SECRET_KEY` | Secret for the Cap site key (not the dashboard admin key) | - |
| `CAP_VERIFY_TIMEOUT` | Timeout for server-side token verification | `3s` |
| `STREAM_CAPTCHA_LIMITS` | Rolling per-session and per-IP thresholds that trigger a stream challenge | - |
| `STREAM_CAPTCHA_CLEARANCE_TTL` | How long a successful stream challenge clears that signed session | `15m` |
| `DOWNLOAD_CAPTCHA_MODE` | Download challenge mode: `always` or `off` | `always` |
| `STREAM_BYTES_PER_SECOND` | Per-request audio streaming speed limit in bytes per second (`0` disables) | `0` |
| `STREAM_BURST_BYTES` | Initial burst allowance for each streaming response (`0` means no initial burst) | `0` |
| `DOWNLOAD_BYTES_PER_SECOND` | Per-request download speed limit in bytes per second (`0` disables) | `0` |
| `DOWNLOAD_BURST_BYTES` | Initial burst allowance for each download response (`0` means no initial burst) | `0` |
| `STREAM_IP_BYTES_PER_SECOND` | Aggregate streaming bandwidth per client IP across concurrent responses (`0` disables) | `0` |
| `DOWNLOAD_IP_BYTES_PER_SECOND` | Aggregate download bandwidth per client IP across concurrent responses (`0` disables) | `0` |
| `RATE_LIMIT_WINDOW` | General API rate-limit window in milliseconds | `60000` |
| `MAX_REQUESTS_PER_WINDOW` | General API requests allowed per client IP per window | `100` |
| `IMAGE_RATE_LIMIT_WINDOW` | Thumbnail and poster rate-limit window in milliseconds | `60000` |
| `MAX_IMAGES_PER_WINDOW` | Thumbnail and poster requests allowed per client IP per window | `300` |
| `SHARE_REQUEST_LIMIT` | Source submissions to `/api/share` allowed per client IP per window | `3` |
| `SHARE_LIMIT_WINDOW` | Source-submission rate-limit window in milliseconds | `86400000` |
| `CONTACT_REQUEST_LIMIT` | Contact submissions allowed per client IP per window | `5` |
| `CONTACT_LIMIT_WINDOW` | Contact rate-limit window in milliseconds | `86400000` |
| `CORS_ORIGINS` | Comma-separated allowed origins for cross-origin API requests | `http://localhost:5173` |
| `CONTENT_DIR` | Directory for `about.md` | `./content` |
| `STATIC_DIR` | Directory for built frontend files | `./static` |
| `ARTWORK_CACHE_DIR` | Writable cache directory for card and blurred mature thumbnails | OS user cache directory + `/audio-share/artwork`; Docker: `/app/cache/artwork` |
| `DATABASE_URL` | PostgreSQL connection URL; schema changes run with the `migrate` command | `postgres://audio_share:audio_share@localhost:5432/audio_share` |
| `MANAGEMENT_ADDR` | Internal readiness, status, retire/resume/shutdown listener; never expose publicly | `127.0.0.1:9090` |
| `INDEX_WEBHOOK_URL` | Optional URL receiving an `index_complete` JSON POST after reindexing | - |
| `INDEX_WEBHOOK_TOKEN` | Optional bearer token for the index webhook | - |
| `INDEX_SCHEDULE` | Cron expression for automatic reindexing (e.g., `0 */6 * * *`) | - (disabled) |
| `DEFAULT_TITLE` | Site title (injected into frontend) | `Audio Archive` |
| `DEFAULT_DESCRIPTION` | Site description (injected into frontend) | `Browse and listen to audio files` |
| `BANNER_MESSAGE` | Optional global info banner message (injected into frontend) | - |
| `BANNER_VARIANT` | Banner style: `info`, `warning`, or `success` | `info` |
| `BANNER_LINK_TEXT` | Optional banner link text | - |
| `BANNER_LINK_URL` | Optional banner link URL, internal path or absolute URL | - |
| `RYBBIT_URL` | Rybbit base URL without a trailing slash; the server appends `/api/script.js` | - |
| `RYBBIT_SITE_ID` | Rybbit site ID; both Rybbit settings are required to enable analytics | - |
| `NTFY_URL` | Ntfy server URL | `https://ntfy.sh` |
| `NTFY_TOPIC` | Ntfy topic for notifications | - |
| `NTFY_TOKEN` | Ntfy authentication token | - |
| `NTFY_PRIORITY` | Priority for visitor request and contact notifications | `1` |
| `NTFY_REVIEW_URL` | Optional source-request review action URL; submitted URL is added as the `Channel` query parameter | - |
| `NTFY_ERROR_TOPIC` | Separate operational-error topic; blank disables error reporting | - |
| `ERROR_REPORT_WINDOW` | Error counting window | `5m` |
| `ERROR_ALERT_COOLDOWN` | Minimum time between alerts for the same error group | `30m` |
| `ERROR_REPORT_RETENTION` | Raw report retention | `168h` |
| `ERROR_BROWSER_THRESHOLD` | Browser reports required per group/window | `10` |
| `ERROR_BROWSER_MIN_SOURCES` | Distinct browser sources required (signed session, or IP fallback) | `3` |
| `ERROR_SERVER_THRESHOLD` | Server reports required per group/window | `5` |
| `ERROR_MUTATION_THRESHOLD` | Lower threshold for failed likes/preferences writes, recovery, contact, source submissions | `3` |
| `ERROR_JOB_THRESHOLD` | Failed or degraded job runs required | `1` |
| `SOURCE_NORMALIZER_SCRIPT` | Path to the Python source normalizer (container path when using Docker) | - |
| `SOURCE_NORMALIZER_TIMEOUT` | Maximum time allowed to resolve a creator URL | `15s` |
| `WAVEFORM_CRON` | Cron expression for waveform generation (e.g., `0 3 * * *`) | - (disabled) |
| `WAVEFORM_MAX_DURATION` | Time budget for dispatching waveform work; in-flight work finishes afterward (e.g., `2h`, `30m`) | `2h` |
| `WAVEFORM_WORKERS` | Concurrent waveform generators per job (minimum `1`) | `1` |

## Compose variables

These variables configure Compose itself; use `--env-file .env.local` so Compose reads them:

| Variable | Purpose | Default |
|----------|---------|---------|
| `APP_IMAGE` | Image used by app, worker, and migrations | `ghcr.io/rebelonion/audio-share:latest` |
| `AUDIO_PATH` | Host audio directory | `./audio` |
| `CONTENT_PATH` | Host content directory | `./content` |
| `SOURCE_NORMALIZER_PATH` | Host Python normalizer file | `/scripts/source_normalizer.py` |
| `DB_USER` | PostgreSQL user | `audio_share` |
| `DB_PASSWORD` | PostgreSQL password | `audio_share` |
| `DB_NAME` | PostgreSQL database | `audio_share` |
| `PORT` | Published app port; the container listens on 8080 | `8080` |
| `CAP_PORT` | Published Cap port | `3000` |
| `ADMIN_KEY` | Cap dashboard login, separate from the app admin API key | None |

Set database credentials before first startup. Changing these values later does not change credentials in an existing PostgreSQL data volume. Compose constructs `DATABASE_URL` from the `DB_*` values, overriding any `DATABASE_URL` in `.env.local`.
