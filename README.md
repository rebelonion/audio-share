# Audio Share

Browse, play, and share audio files from a collection you host.

![React](https://img.shields.io/badge/React-19-61dafb)
![Go](https://img.shields.io/badge/Go-1.24-00ADD8)
![TypeScript](https://img.shields.io/badge/TypeScript-5-blue)
![TailwindCSS](https://img.shields.io/badge/TailwindCSS-3.4-38b2ac)
![Docker](https://img.shields.io/badge/Docker-Supported-2496ED)

## Features

- Browse your audio library with folder-based navigation (including from external directories)
- Search the entire library by name, artist, title, or description
- Stream audio files directly in the browser
- Use a persistent queue, folder playlists, autoplay, playback controls, and a waveform visualizer
- Save likes without an account and recover them with a text key or QR code
- Display metadata for audio files including title, artist, and album art
- Share links to specific audio files
- Use the responsive layout on desktop and mobile
- Request new artists/channels to be added via ntfy notifications
- Add custom folder names, item counts, and source links

## Installation

### Docker

Build and run with Docker Compose:

```bash
docker compose up --build
```

Or build the image manually:

```bash
docker build -t audio-share .
docker run -p 8080:8080 \
  -v /path/to/your/audio:/audio:ro \
  -v /path/to/your/content:/app/content:ro \
  -e AUDIO_DIR=/audio:Audio \
  -e SESSION_SECRET=replace-with-a-long-random-value \
  audio-share
```

#### Docker Compose

The included `docker-compose.yml`:

```yaml
services:
  app:
    image: ghcr.io/rebelonion/audio-share:latest
    ports:
      - "8080:8080"
    environment:
      - AUDIO_DIR=/audio:Audio
      - SESSION_SECRET=replace-with-a-long-random-value
    volumes:
      - /path/to/your/audio:/audio:ro
      - /path/to/your/content:/app/content:ro
    restart: unless-stopped
```

### Manual

1. Clone the repository:
   ```bash
   git clone <your-repo-url>
   cd audio-share
   ```

2. Install frontend dependencies:
   ```bash
   cd frontend
   npm install
   ```

3. Set up your audio directory:
   - Configure the `AUDIO_DIR` environment variable
   - Format: `/path/to/audio:Display Name` or comma-separated for multiple directories:
     ```
     AUDIO_DIR=/path/to/music:Music Library,/path/to/podcasts:Podcasts
     ```
   - Add your audio files and folders to your chosen directory/directories
   - Optional: Add thumbnail images and metadata JSON files (see metadata section below)

## Environment Variables

All configuration is done via environment variables on the Go server. Frontend config is injected at runtime, so you can use a pre-built Docker image with different settings.

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Server port | `8080` |
| `AUDIO_DIR` | Audio directories (format: `/path:Name,/path2:Name2`) | - |
| `SESSION_SECRET` | Required secret used to sign anonymous sessions and media access keys | - |
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
| `STREAM_BURST_BYTES` | Initial burst allowance for each streaming response (`0` disables) | `0` |
| `DOWNLOAD_BYTES_PER_SECOND` | Per-request download speed limit in bytes per second (`0` disables) | `0` |
| `DOWNLOAD_BURST_BYTES` | Initial burst allowance for each download response (`0` disables) | `0` |
| `STREAM_IP_BYTES_PER_SECOND` | Aggregate streaming bandwidth per client IP across concurrent responses (`0` disables) | `0` |
| `DOWNLOAD_IP_BYTES_PER_SECOND` | Aggregate download bandwidth per client IP across concurrent responses (`0` disables) | `0` |
| `RATE_LIMIT_WINDOW` | General API rate-limit window in milliseconds | `60000` |
| `MAX_REQUESTS_PER_WINDOW` | General API requests allowed per client IP per window | `100` |
| `IMAGE_RATE_LIMIT_WINDOW` | Thumbnail and poster rate-limit window in milliseconds | `60000` |
| `MAX_IMAGES_PER_WINDOW` | Thumbnail and poster requests allowed per client IP per window | `300` |
| `CONTENT_DIR` | Directory for `about.md` | `./content` |
| `STATIC_DIR` | Directory for built frontend files | `./static` |
| `DB_PATH` | Path to SQLite database file for search index | `./audio-share.db` |
| `INDEX_SCHEDULE` | Cron expression for automatic reindexing (e.g., `0 */6 * * *`) | - (disabled) |
| `DEFAULT_TITLE` | Site title (injected into frontend) | `Audio Archive` |
| `DEFAULT_DESCRIPTION` | Site description (injected into frontend) | `Browse and listen...` |
| `BANNER_MESSAGE` | Optional global info banner message (injected into frontend) | - |
| `BANNER_VARIANT` | Banner style: `info`, `warning`, or `success` | `info` |
| `BANNER_LINK_TEXT` | Optional banner link text | - |
| `BANNER_LINK_URL` | Optional banner link URL, internal path or absolute URL | - |
| `UMAMI_URL` | Umami analytics script URL | - |
| `UMAMI_WEBSITE_ID` | Umami website ID | - |
| `NTFY_URL` | Ntfy server URL | `https://ntfy.sh` |
| `NTFY_TOPIC` | Ntfy topic for notifications | - |
| `NTFY_TOKEN` | Ntfy authentication token | - |
| `WAVEFORM_CRON` | Cron expression for waveform generation (e.g., `0 3 * * *`) | - (disabled) |
| `WAVEFORM_MAX_DURATION` | Max time to spend generating waveforms per run (e.g., `2h`, `30m`) | `2h` |

Stream and download burst allowances are separate token-bucket capacities that refill at their corresponding per-request rates. When an aggregate IP limit is enabled, its shared bucket capacity is derived as the greater of one second at the IP rate or the matching per-request burst. This lets one response use its configured startup burst while concurrent responses from the same IP still share a single aggregate allowance.

Key limits are evaluated as rolling windows, and every configured window must allow an issuance. For example:

```env
STREAM_KEY_LIMITS=2/1m,10/1h,20/24h
DOWNLOAD_KEY_LIMITS=1/1m,5/1h,10/24h
DOWNLOAD_SESSION_MIN_AGE=5m
```

Each rolling policy is enforced independently for the signed session and the resolved client IP, so replacing a browser session does not reset the IP allowance. When `DOWNLOAD_SESSION_MIN_AGE` is enabled, its delay begins when the server signs the session's creation-time cookie. Legacy sessions receive that cookie on their next session bootstrap.

One key is issued for a logical playback or download. Browser Range requests made with that key do not consume additional key allowances. Limit state and aggregate IP bandwidth state are held in memory and are not shared between application replicas.

### Cap CAPTCHA

The optional `cap` Docker Compose profile runs Cap Standalone with a private Valkey instance:

```bash
cp .env.local.example .env.local
# Set ADMIN_KEY to at least 32 random characters.
docker compose --env-file .env.local --profile cap up -d cap
```

Open `http://localhost:3000`, sign in with `ADMIN_KEY`, and create a site key. Keep instrumentation enabled. Then configure Audio Share:

```env
CAP_ENFORCEMENT=observe
CAP_PUBLIC_ENDPOINT=http://localhost:3000/<site-key>/
CAP_VERIFY_ENDPOINT=http://localhost:3000/<site-key>/siteverify
CAP_SECRET_KEY=<site-key-secret>
STREAM_CAPTCHA_LIMITS=3/1m,10/1h
STREAM_CAPTCHA_CLEARANCE_TTL=15m
DOWNLOAD_CAPTCHA_MODE=always
```
## Audio Files Organization

Organize your audio files in your configured audio directory. The application will automatically:

1. Display folders and audio files in a browsable interface
2. Show properly formatted artist and track names based on directory structure
3. Support common audio formats: MP3, WAV, OGG, FLAC, AAC, M4A, OPUS

### File Metadata

For each audio file, you can add optional metadata:

1. **Thumbnails**: Add an image file with the same base name as your audio file. Supported suffixes (checked in order):
   `-thumb.jpg`, `-thumb.webp`, `-thumb.png`, `.jpg`, `.webp`, `.png`
   - Example: For `song.mp3`, add `song-thumb.jpg` or `song.jpg` in the same directory

2. **Metadata JSON**: Add a JSON file with the same name as your audio file, but with ".info.json" suffix:
   - Example: For `song.mp3`, add `song.info.json` in the same directory

The metadata JSON can include:
```json
{
  "title": "Song Title",
  "meta_artist": "Artist Name",
  "upload_date": "20230215",
  "webpage_url": "https://original-source-url.com",
  "description": "Description text about the song",
  "epoch": 1707955200.0
}
```

The `epoch` field (Unix timestamp of when the file was downloaded) is used to generate stats. This is automatically present in `.info.json` files created by yt-dlp.

### Folder Metadata

You can add metadata for directories with a `folder.json` file in the parent directory:

```json
[
  {
    "folder_name": "actual_folder_name",
    "name": "Display Name",
    "original_url": "https://source-url.com/channel",
    "directory_size": "3.0G",
    "url_broken": false
  }
]
```

## Content Directory

The `content/` directory holds customizable content:

- `about.md` - Markdown content for the About page

## Stats

The stats page (`/stats`) reads from the search index database. It does not need external scripts or static JSON files. It tracks:

- **Audio by day**: Number of audio files downloaded per day, based on the `epoch` field in `.info.json` files
- **Sources by day**: New sources (channels) discovered per day, based on the first download date of files in each source folder

A folder is considered a "source" if it has an `original_url` in its `folder.json` metadata. All audio files within that folder (and its subfolders) are attributed to that source.

## Search Index

The application indexes your audio library in SQLite. Build the index before browsing or searching the library.

### Building the Index

Build the index before starting the server (or immediately after adding new files):

```bash
cd backend
go run . reindex
```

This walks through all configured audio directories and indexes:
- Folder names and metadata from `folder.json` files
- Audio filenames and metadata from `.info.json` files

### Automatic Reindexing

Set the `INDEX_SCHEDULE` environment variable to a cron expression for automatic reindexing:

```bash
INDEX_SCHEDULE="0 */6 * * *" go run .  # Reindex every 6 hours
INDEX_SCHEDULE="0 0 * * *" go run .    # Reindex daily at midnight
```

If not set, the index is only rebuilt when you manually run the `reindex` command. A file lock prevents concurrent reindex attempts. If a scheduled reindex is already running, a manual reindex exits without doing any work.

## Waveform Visualization

The audio player displays a filled waveform for each track. Waveform data is generated server-side using `ffmpeg` and stored in the database as 500 normalized amplitude peaks. The player shows the waveform immediately when available and falls back to a plain progress bar otherwise.

Waveform generation requires `ffmpeg` and `ffprobe` to be available on the server (included in the Docker image).

### Generating Waveforms

Run manually to process all files that don't have waveform data yet (most recently downloaded first):

```bash
cd backend
go run . waveform
```

Override the time limit for a single run:

```bash
WAVEFORM_MAX_DURATION=4h go run . waveform
```

### Automatic Waveform Generation

Set `WAVEFORM_CRON` to run generation on a schedule. The job processes files until `WAVEFORM_MAX_DURATION` elapses, then stops cleanly and resumes at the next scheduled run:

```bash
WAVEFORM_CRON="0 3 * * *" go run .              # Run nightly at 3am, up to 2h
WAVEFORM_CRON="0 3 * * *" WAVEFORM_MAX_DURATION="4h" go run .
```

If `WAVEFORM_CRON` is not set, no automatic generation occurs.

### Database Location

By default, the database is stored at `./audio-share.db`. Override with:

```bash
DB_PATH=/path/to/audio-share.db go run .
```

## Development

Run both the Go backend and Vite dev server:

```bash
# Terminal 1 - Go backend
cd backend
CONTENT_DIR=../content AUDIO_DIR=/path/to/audio:Audio go run .

# Terminal 2 - Vite dev server (with hot reload)
cd frontend
npm run dev
```

- Backend API: http://localhost:8080
- Frontend dev server: http://localhost:5173 (proxies API calls to backend)

### Production Build

Build the frontend:

```bash
cd frontend
npm run build
```

Run Go server with built frontend:

```bash
cd backend
STATIC_DIR=../frontend/dist CONTENT_DIR=../content AUDIO_DIR=/path/to/audio:Audio go run .
```

Open http://localhost:8080 in your browser.

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Acknowledgments

- Built with [React](https://react.dev) and [Go](https://go.dev)
- Frontend tooling by [Vite](https://vitejs.dev)
- Icons by [Lucide](https://lucide.dev)
