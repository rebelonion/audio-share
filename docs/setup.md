# Setup

This guide covers installation, library metadata, and optional integrations. See the [environment variable reference](configuration.md) for all settings and [management guide](management.md) for ongoing maintenance.

## Docker Compose

Run these commands from the repository root. Docker Compose starts PostgreSQL, runs database migrations, and starts the web app and background worker.

```bash
cp .env.local.example .env.local
```

Set the following in `.env.local`:

```env
SESSION_SECRET=replace-with-a-long-random-value
AUDIO_PATH=/path/to/your/audio
CONTENT_PATH=./content
```

Keep `SESSION_SECRET` stable across restarts. Create the audio and content directories before starting the services; the app must be able to read them. Audio and content mounts are read-only, while PostgreSQL data and cached artwork use named volumes.

The included Compose file also mounts an external Python source normalizer. To normalize source requests, set `SOURCE_NORMALIZER_PATH` to that script on the host. The script is not included in this repository. Otherwise, remove the normalizer volume and `SOURCE_NORMALIZER_SCRIPT` entry from the shared `x-app` configuration in `docker-compose.yml`.

Visitor source requests and contact submissions require working `NTFY_URL` and `NTFY_TOPIC` settings, plus `NTFY_TOKEN` if your ntfy server requires authentication. Replace the example notification credentials. Without a normalizer, source requests still send the submitted URL for manual review.

Start the services and build the library index:

```bash
docker compose --env-file .env.local up -d
docker compose --env-file .env.local exec app ./audio-share-backend reindex
```

Open [localhost:8080](http://localhost:8080). Set `PORT` in `.env.local` to change the published port.

Compose uses a prebuilt image. To build from your checkout:

```bash
docker build -t audio-share:local .
```

Set `APP_IMAGE=audio-share:local` in `.env.local`, then run the same Compose startup command.

See the [Compose variable reference](configuration.md#compose-variables) for host paths, database credentials, ports, and image settings.

### Multiple audio directories

Add each host directory to the shared `x-app.volumes` list, and update `AUDIO_DIR` in `x-app.environment` to use the container paths:

```yaml
environment:
  - AUDIO_DIR=/music:Music,/podcasts:Podcasts
volumes:
  - /path/to/music:/music:ro
  - /path/to/podcasts:/podcasts:ro
```

Merge these entries with the existing settings and mounts. Compose's explicit `environment` entries override values from `.env.local`, so changing `AUDIO_DIR` only in that file will not change the included Compose configuration.

## Running without Docker

Install Go 1.25 or newer, Node.js 22.22.0 or newer and npm (required by the locked frontend dependencies), and PostgreSQL. Install `ffmpeg` and `ffprobe` if you want waveform generation, and Python 3 if you use the source normalizer.

Create a PostgreSQL database and copy `.env.local.example` to `.env.local`. Set the connection details and paths there:

```env
DATABASE_URL=postgres://audio_share:your-password@localhost:5432/audio_share
SESSION_SECRET=replace-with-a-long-random-value
AUDIO_DIR=/path/to/audio:Audio
STATIC_DIR=../frontend/dist
CONTENT_DIR=../content
```

These relative paths assume you run the backend from `backend/`. The Go commands load `.env.local` from the current directory or its parent; exported environment variables take precedence.

Build the frontend from the repository root, then initialize the database and library:

```bash
npm --prefix frontend ci --legacy-peer-deps
npm --prefix frontend run build
cd backend
go run . migrate
go run . reindex
go run . serve
```

Open [localhost:8080](http://localhost:8080). To run scheduled jobs, start a worker in another terminal from `backend/`:

```bash
MANAGEMENT_ADDR=127.0.0.1:9091 go run . worker
```

The worker needs a different management port when it shares a host with the web server. Keep both management listeners private. Configure job schedules using the [management guide](management.md#scheduled-jobs).

## Library metadata

Each audio file needs a valid `.info.json` file with the same base name. For example, place `song.info.json` alongside `song.mp3`:

```json
{
  "id": "stable-media-id",
  "title": "Song Title",
  "meta_artist": "Artist Name",
  "upload_date": "20230215",
  "webpage_url": "https://example.com/original-track",
  "description": "Description of the recording",
  "epoch": 1707955200.0
}
```

Use a stable ID unique within its folder so audio renamed or replaced within that folder retains its share links, likes, and playback history. If `id` is omitted, the app looks for a final `[id]` in the filename, such as `Song [12345].m4a`.

The `epoch` field is the download time as a Unix timestamp, used by the stats page. Include it when exporting yt-dlp metadata; tracks without a positive `epoch` do not appear in the daily download counts. If `meta_artist` is empty, the app uses `uploader`. If `upload_date` is empty, it uses the audio file’s modification date.

### Artwork

Place optional artwork alongside the audio file. For `song.mp3`, the app checks these filenames in order:

```text
song-thumb.jpg
song-thumb.webp
song-thumb.png
song.jpg
song.webp
song.png
```

### Folder metadata

Create `folder.json` in the parent directory of the folders you want to describe. It contains an array of entries:

```json
[
  {
    "folder_name": "actual_folder_name",
    "name": "Display Name",
    "original_url": "https://example.com/channel"
  }
]
```

Folder size is calculated from indexed audio files. Broken-source status is calculated from the tracks’ source-unavailability flags; `directory_size` and `url_broken` in `folder.json` do not override these values. For folder artwork, place `poster.jpg`, `artist.jpg`, `cover.jpg`, or `album.jpg` inside the folder, in that priority order.

Run a [reindex](management.md#indexing-the-library) after changing library files or metadata.

## Site content

Set `DEFAULT_TITLE` and `DEFAULT_DESCRIPTION` in `.env.local`, and put Markdown for the About page in `content/about.md` (or your configured content directory).

For a site-wide announcement, set `BANNER_MESSAGE` and choose `BANNER_VARIANT=info`, `warning`, or `success`. Use `BANNER_LINK_TEXT` and `BANNER_LINK_URL` to add an optional link.

For optional analytics, set `RYBBIT_URL` to your Rybbit base URL without a trailing slash and `RYBBIT_SITE_ID` to the site ID. The old `UMAMI_*` variables are no longer read.

## Optional Cap CAPTCHA

The integration uses [Cap Standalone](https://capjs.js.org/guide/standalone/index.html). Set `ADMIN_KEY` in `.env.local` to at least 32 random characters, then start the optional Cap service and its private Valkey instance:

```bash
docker compose --env-file .env.local --profile cap up -d cap
```

Open [localhost:3000](http://localhost:3000), sign in with `ADMIN_KEY`, and create a site key. Keep instrumentation enabled. Add the site details to `.env.local`:

```env
CAP_ENFORCEMENT=observe
CAP_PUBLIC_ENDPOINT=http://localhost:3000/<site-key>/
CAP_VERIFY_ENDPOINT=http://cap:3000/<site-key>/siteverify
CAP_SECRET_KEY=<site-key-secret>
STREAM_CAPTCHA_LIMITS=3/1m,10/1h
STREAM_CAPTCHA_CLEARANCE_TTL=15m
DOWNLOAD_CAPTCHA_MODE=always
```

`CAP_PUBLIC_ENDPOINT` must be reachable by visitors' browsers; replace localhost with your public Cap URL for a hosted site. `CAP_VERIFY_ENDPOINT` is reached by the server, so the Compose app uses `cap:3000`. A server running outside Docker needs a verification URL reachable from its host.

`CAP_SECRET_KEY` is the site key's secret, distinct from the dashboard's `ADMIN_KEY`. Start with `observe` to log when challenges would be required without presenting or verifying them, then use `enforce` to require challenges. Keep stream key limits higher than the CAPTCHA thresholds so a challenge can occur before access is denied.

Apply configuration changes with the command in [management](management.md#applying-configuration-changes).
