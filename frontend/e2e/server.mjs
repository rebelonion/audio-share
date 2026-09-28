// Deterministic browser fixtures; production API behavior is covered by Go integration tests.
import {createServer} from 'node:http';
import {randomBytes, randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {resolve, extname, sep} from 'node:path';
import {fileURLToPath} from 'node:url';

const dist = fileURLToPath(new URL('../dist', import.meta.url));
const profiles = new Map();
const keys = new Map();
const tracks = ['rain', 'river'].map((key, index) => ({
    id: index + 1, shareKey: key, path: `audio/${key}.wav`, filename: `${key}.wav`,
    name: key === 'rain' ? 'Rain on the roof' : 'River at dawn',
    title: key === 'rain' ? 'Rain on the roof' : 'River at dawn',
    artist: 'Browser fixtures', parentPath: 'audio', parentFolderName: 'Audio',
    duration: 120, ageLimit: 0, type: 'audio', thumbnail: false, deleted: false,
}));
const sampleRate = 8000;
const wav = Buffer.alloc(44 + sampleRate * 120 * 2);
wav.write('RIFF', 0); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8);
wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
wav.writeUInt32LE(sampleRate, 24); wav.writeUInt32LE(sampleRate * 2, 28);
wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write('data', 36);
wav.writeUInt32LE(wav.length - 44, 40);
const mime = {'.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.wasm': 'application/wasm'};

createServer(async (req, res) => {
    try {
        const url = new URL(req.url, 'http://127.0.0.1:4175');
        const path = url.pathname;
        const setProfile = id => res.setHeader('Set-Cookie', `fixture-profile=${id}; Path=/; HttpOnly; SameSite=Lax`);
        let profileId = req.headers.cookie?.match(/(?:^|; )fixture-profile=([^;]+)/)?.[1];
        if (!profiles.has(profileId)) {
            profileId = randomUUID();
            profiles.set(profileId, {likes: new Set(), hasRecoveryKey: false});
            setProfile(profileId);
        }
        const profile = profiles.get(profileId);
        const json = (body, status = 200) => {
            res.writeHead(status, {'Content-Type': 'application/json', 'Cache-Control': 'no-store'});
            res.end(JSON.stringify(body));
        };
        const body = async () => {
            let text = '';
            for await (const chunk of req) text += chunk;
            return JSON.parse(text || '{}');
        };
        if (path === '/api/health') return json({ok: true});
        if (path === '/api/session/targeted-message') { res.writeHead(204); return res.end(); }
        if (path === '/api/session' || path === '/api/playback/record') return json({sessionId: profileId});
        if (path === '/api/preferences/mature-content') return json({enabled: false});
        if (path === '/api/version') return json({buildId: ''});
        if (path === '/api/likes') return json({profileId, hasRecoveryKey: profile.hasRecoveryKey, shareKeys: [...profile.likes]});
        if (path === '/api/likes/tracks') return json({tracks: tracks.filter(track => profile.likes.has(track.shareKey))});
        if (path.startsWith('/api/likes/')) {
            const key = path.split('/').at(-1);
            if (req.method === 'PUT') profile.likes.add(key);
            else if (req.method === 'DELETE') profile.likes.delete(key);
            return json({success: true});
        }
        if (path === '/api/profile/recovery-key') {
            const recoveryKey = `asr_${randomBytes(32).toString('base64url')}`;
            keys.set(recoveryKey, profileId);
            profile.hasRecoveryKey = true;
            return json({recoveryKey});
        }
        if (path === '/api/profile/recover') {
            const recovered = keys.get((await body()).recoveryKey);
            if (!recovered) return json({error: 'Invalid recovery key'}, 400);
            setProfile(recovered);
            return json({profileId: recovered});
        }
        if (path === '/api/search') {
            const query = url.searchParams.get('q') || '';
            const results = tracks.filter(track => track.title.toLowerCase().includes(query.toLowerCase()));
            return json({results, total: results.length, count: results.length, query, offset: 0, limit: 50});
        }
        if (path.startsWith('/api/browse')) return json({items: [], currentPath: ''});
        if (path.startsWith('/api/playback/')) return json({tracks: []});
        if (path.startsWith('/api/audio/key/')) {
            const key = path.split('/')[4];
            if (path.endsWith('/meta')) return json(tracks.find(track => track.shareKey === key) || {}, tracks.some(track => track.shareKey === key) ? 200 : 404);
            if (path.endsWith('/waveform')) return json({duration: 120});
            if (path.endsWith('/access')) return json({accessKey: 'fixture-access', expiresInMs: 3_600_000});
        }
        if (/^\/api\/audio\/key\/[^/]+$/.test(path)) {
            const range = req.headers.range?.match(/^bytes=(\d+)-(\d*)$/);
            const start = range ? Number(range[1]) : 0;
            const end = range?.[2] ? Math.min(Number(range[2]), wav.length - 1) : wav.length - 1;
            if (start > end) { res.writeHead(416, {'Content-Range': `bytes */${wav.length}`}); return res.end(); }
            res.writeHead(range ? 206 : 200, {'Content-Type': 'audio/wav', 'Accept-Ranges': 'bytes', 'Content-Length': end - start + 1,
                ...(range ? {'Content-Range': `bytes ${start}-${end}/${wav.length}`} : {})});
            return res.end(wav.subarray(start, end + 1));
        }
        if (path.startsWith('/api/')) return json({error: 'Unknown fixture endpoint'}, 404);
        const target = resolve(dist, '.' + decodeURIComponent(path));
        if (target !== dist && !target.startsWith(dist + sep)) { res.writeHead(404); return res.end(); }
        const file = extname(path) ? target : resolve(dist, 'index.html');
        const data = await readFile(file);
        res.writeHead(200, {'Content-Type': mime[extname(file)] || 'application/octet-stream'});
        res.end(data);
    } catch {
        res.writeHead(500); res.end('Fixture request failed');
    }
}).listen(4175, '127.0.0.1', () => process.stdout.write('Browser fixtures: http://127.0.0.1:4175\n'));
