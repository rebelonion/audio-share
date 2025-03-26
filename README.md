# Audio Share

A modern web application for browsing, playing, and sharing audio files from your local collection.

![Next.js](https://img.shields.io/badge/Next.js-15.2.3-black)
![TypeScript](https://img.shields.io/badge/TypeScript-5-blue)
![TailwindCSS](https://img.shields.io/badge/TailwindCSS-3.4-38b2ac)
![React](https://img.shields.io/badge/React-19-61dafb)

## Features

- 📁 Browse your audio library with folder-based navigation (including from external directories)
- 🎵 Stream audio files directly in the browser
- 🔊 Fully-featured audio player with playback controls, volume adjustment, and progress bar
- 📊 Display metadata for audio files including title, artist, and album art
- 🔗 Share links to specific audio files
- 📱 Responsive design that works on all devices
- 🔄 Request new artists/channels to be added via ntfy notifications
- 📂 Enhanced folder presentation with custom names, item counts, and source links

## Installation

1. Clone the repository:
   ```bash
   git clone <your-repo-url>
   cd audio-share
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Set up your audio directory:
   - Option 1: Create a directory `public/audio` in the project root
   - Option 2: Use any external directory by setting the `AUDIO_DIR` environment variable in `.env.local`
   - Option 3: Configure multiple audio directories by providing a comma-separated list in the `AUDIO_DIR` environment variable:
     ```
     # Basic multi-directory setup (directory names will be used as display names)
     AUDIO_DIR=/path/to/audio1,/path/to/audio2,/path/to/audio3
     
     # With custom display names (format: path:name)
     AUDIO_DIR=/path/to/audio1:Music Library,/path/to/audio2:Podcasts,/path/to/audio3:Audiobooks
     ```
   - Display names are shown in the UI and used to generate URL-friendly slugs
   - URL paths automatically use slugified versions of directory names (e.g., "Music Library" becomes "music-library")
   - Add your audio files and folders to your chosen directory/directories
   - Optional: Add thumbnail images and metadata JSON files (see metadata section below)

## Usage

### Development

Run the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### Production Build

Build for production:

```bash
npm run build
```

Start the production server:

```bash
npm run start
```

## Audio Files Organization

Organize your audio files in your configured audio directory. The application will automatically:

1. Display folders and audio files in a browsable interface
2. Show properly formatted artist and track names based on directory structure
3. Support common audio formats: MP3, WAV, OGG, FLAC, AAC, M4A, OPUS

### Enhanced Metadata

For each audio file, you can add optional metadata:

1. **Thumbnails**: Add an image file with the same name as your audio file, but with "-thumb.jpg" suffix:
   - Example: For `song.mp3`, add `song-thumb.jpg` in the same directory

2. **Metadata JSON**: Add a JSON file with the same name as your audio file, but with ".info.json" suffix:
   - Example: For `song.mp3`, add `song.info.json` in the same directory

The metadata JSON can include:
```json
{
  "title": "Song Title",
  "meta_artist": "Artist Name",
  "upload_date": "20230215",
  "webpage_url": "https://original-source-url.com",
  "description": "Description text about the song"
}
```

### Folder Metadata

You can add enhanced metadata for directories by adding a `folder.json` file in the parent directory. This file contains an array of metadata objects for subdirectories:

```json
[
  {
    "folder_name": "actual_folder_name",
    "name": "Display Name",
    "original_url": "https://source-url.com/channel",
    "items": 53,
    "directory_size": "3.0G"
  },
  {
    "folder_name": "another_folder",
    "name": "Another Display Name",
    "original_url": "https://another-url.com",
    "items": 42,
    "directory_size": "1.2G"
  }
]
```

Each entry maps a folder name to its display information:
- `folder_name`: The actual directory name to match
- `name`: The display name shown in the UI
- `original_url`: Optional link to the original content source
- `items`: Optional number of items in the folder
- `directory_size`: Optional human-readable size of the directory

## Customization

You can customize the application by:

1. Modifying the Tailwind configuration in `tailwind.config.js`
2. Adjusting the global styles in `app/globals.css`
3. Updating audio file filters in `lib/fileSystem.ts`
4. Setting a custom audio directory path in `.env.local` with the `AUDIO_DIR` environment variable
5. Configure ntfy notification settings by setting `NTFY_URL`, `NTFY_TOPIC` and `NTFY_TOKEN` in `.env.local`
6. Adjust rate limits for artist requests with `SHARE_REQUEST_LIMIT` and `SHARE_LIMIT_WINDOW`

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Acknowledgments

- Built with [Next.js](https://nextjs.org)
- Icons by [Lucide](https://lucide.dev)
