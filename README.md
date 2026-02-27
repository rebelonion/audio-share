# Audio Share

A modern web application for browsing, playing, and sharing audio files from your local collection.

![React](https://img.shields.io/badge/React-19-61dafb)
![Go](https://img.shields.io/badge/Go-1.24-00ADD8)
![TypeScript](https://img.shields.io/badge/TypeScript-5-blue)
![TailwindCSS](https://img.shields.io/badge/TailwindCSS-3.4-38b2ac)
![Docker](https://img.shields.io/badge/Docker-Supported-2496ED)

## Features

- Browse your audio library with folder-based navigation (including from external directories)
- **Global search** across the entire library by name, artist, title, or description
- Stream audio files directly in the browser
- Fully-featured audio player with playback controls, volume adjustment, and progress bar
- Display metadata for audio files including title, artist, and album art
- Share links to specific audio files
- Responsive design that works on all devices
- Request new artists/channels to be added via ntfy notifications
- Enhanced folder presentation with custom names, item counts, and source links

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
| `CONTENT_DIR` | Directory for about.md and stats JSON | `./content` |
| `STATIC_DIR` | Directory for built frontend files | `./static` |
| `DB_PATH` | Path to SQLite database file for search index | `./audio-share.db` |
| `INDEX_SCHEDULE` | Cron expression for automatic reindexing (e.g., `0 */6 * * *`) | - (disabled) |
| `DEFAULT_TITLE` | Site title (injected into frontend) | `Audio Archive` |
| `DEFAULT_DESCRIPTION` | Site description (injected into frontend) | `Browse and listen...` |
| `UMAMI_URL` | Umami analytics script URL | - |
| `UMAMI_WEBSITE_ID` | Umami website ID | - |
| `NTFY_URL` | Ntfy server URL | `https://ntfy.sh` |
| `NTFY_TOPIC` | Ntfy topic for notifications | - |
| `NTFY_TOKEN` | Ntfy authentication token | - |

## Audio Files Organization

Organize your audio files in your configured audio directory. The application will automatically:

1. Display folders and audio files in a browsable interface
2. Show properly formatted artist and track names based on directory structure
3. Support common audio formats: MP3, WAV, OGG, FLAC, AAC, M4A, OPUS

### Enhanced Metadata

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

You can add enhanced metadata for directories by adding a `folder.json` file in the parent directory:

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

The stats page (`/stats`) is generated directly from the search index database — no external scripts or static JSON files needed. It tracks:

- **Audio by day**: Number of audio files downloaded per day, based on the `epoch` field in `.info.json` files
- **Sources by day**: New sources (channels) discovered per day, based on the first download date of files in each source folder

A folder is considered a "source" if it has an `original_url` in its `folder.json` metadata. All audio files within that folder (and its subfolders) are attributed to that source.

## Search Index

The application uses a SQLite database to index your audio library. All browsing and search is served from the database, so the index must be built before the application is useful.

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

If not set, the index is only rebuilt when you manually run the `reindex` command. Concurrent reindex attempts (e.g., a manual `reindex` while the scheduler is running) are prevented via a file lock — the second caller skips gracefully.

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
