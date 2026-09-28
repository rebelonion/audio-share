# Audio Share

Browse, play, and share audio files from a collection you host.

![React](https://img.shields.io/badge/React-19-61dafb)
![Go](https://img.shields.io/badge/Go-1.25-00ADD8)
![TypeScript](https://img.shields.io/badge/TypeScript-5-blue)
![TailwindCSS](https://img.shields.io/badge/TailwindCSS-3.4-38b2ac)
![Docker](https://img.shields.io/badge/Docker-Supported-2496ED)

## Features

- Browse folders and search by name, artist, title, or description
- Stream audio in the browser with a persistent queue and waveform player
- Save likes without an account and recover them with a text key or QR code
- Share links to individual tracks
- View artwork, track metadata, and links to original sources
- Listen on desktop or mobile

## Getting started

The included [Docker Compose configuration](docker-compose.yml) runs the app, a background worker, and PostgreSQL.

Copy the example configuration:

```bash
cp .env.local.example .env.local
```

Edit `.env.local` to set a long, random `SESSION_SECRET` and the host path to your audio library:

```env
SESSION_SECRET=replace-with-a-long-random-value
AUDIO_PATH=/path/to/your/audio
```

Review the volume paths in `docker-compose.yml`. Optional source-request normalization uses an external Python script at `SOURCE_NORMALIZER_PATH`; set that path if you use it, or remove its mount and `SOURCE_NORMALIZER_SCRIPT` setting from the Compose file.

Start the services and index your library:

```bash
docker compose --env-file .env.local up -d
docker compose --env-file .env.local exec app ./audio-share-backend reindex
```

Open [localhost:8080](http://localhost:8080). Compose runs database migrations through its `migrate` service before starting the app and worker. Run the reindex command again after adding files, or set `INDEX_SCHEDULE` in `.env.local` for automatic indexing.

## Preparing your library

Organize audio into folders however you like. Supported formats include MP3, WAV, OGG, FLAC, AAC, M4A, and OPUS.

Each audio file needs a matching `.info.json` metadata file, such as those produced by yt-dlp. For `song.mp3`, create `song.info.json`:

```json
{
  "id": "stable-media-id",
  "title": "Song Title",
  "meta_artist": "Artist Name"
}
```

Keep the ID stable and unique within its folder to preserve share links and likes when files are renamed within that folder. Artwork is optional: place an image such as `song.jpg` or `song-thumb.jpg` alongside the audio file.

## Configuration

Start with [.env.local.example](.env.local.example) and see the [configuration reference](docs/configuration.md) for settings and defaults. Set `DEFAULT_TITLE` and `DEFAULT_DESCRIPTION` to name your site, and add `content/about.md` to customize the About page.

## Documentation

- [Setup](docs/setup.md): installation, library metadata, site content, and CAPTCHA
- [Configuration](docs/configuration.md): server environment variables and Docker Compose settings
- [Management](docs/management.md): indexing, waveforms, scheduled jobs, health, and access limits

## License

[MIT](LICENSE)
