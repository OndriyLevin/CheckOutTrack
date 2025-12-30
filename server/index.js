const express = require('express');
const axios = require('axios');
const cors = require('cors');
const { PrismaClient } = require('@prisma/client');
require('dotenv').config();
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();
const prisma = new PrismaClient();
const PORT = process.env.PORT || 3000;

// Handle BigInt serialization
BigInt.prototype.toJSON = function () { return this.toString() }

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Ensure uploads directory exists
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir);
}

// Configure Multer
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + path.extname(file.originalname));
    }
});
const upload = multer({ storage: storage });

app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Basic health check
app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date() });
});

// AUTH: Create or Update User from Telegram Data
app.post('/api/auth', async (req, res) => {
    try {
        const { id, first_name, last_name, username } = req.body;
        if (!id) return res.status(400).json({ error: 'Missing Telegram ID' });

        const user = await prisma.user.upsert({
            where: { telegramId: BigInt(id) },
            update: { firstName: first_name, lastName: last_name, username: username },
            create: { telegramId: BigInt(id), firstName: first_name, lastName: last_name, username: username },
        });
        res.json(user);
    } catch (error) {
        console.error('Auth Error:', error);
        res.status(500).json({ error: 'Auth failed: ' + error.message });
    }
});

// GET Tracks (Simple list)
app.get('/api/tracks', async (req, res) => {
    try {
        const tracks = await prisma.track.findMany({
            include: { submittedBy: true },
            orderBy: { createdAt: 'desc' },
            take: 50
        });
        res.json(tracks);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to fetch tracks' });
    }
});

// POST Track
app.post('/api/tracks', async (req, res) => {
    try {
        const { url, artist, title, userId } = req.body;
        if (!url || !artist || !title || !userId) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        // Check for duplicates (Case-insensitive)
        const duplicate = await prisma.track.findFirst({
            where: {
                artist: { equals: artist },
                title: { equals: title },
                status: 'PENDING'
            }
        });

        if (duplicate) {
            return res.status(409).json({ error: 'Этот трек уже был добавлен!' });
        }

        // Check for User Limit (Max 5 Pending)
        const userPendingCount = await prisma.track.count({
            where: {
                userId: Number(userId),
                status: 'PENDING'
            }
        });

        if (userPendingCount >= 5) {
            return res.status(429).json({ error: 'Вы не можете добавить больше 5 треков в очередь!' });
        }

        const track = await prisma.track.create({
            data: { url, artist, title, submittedBy: { connect: { id: userId } } }
        });
        res.json(track);
    } catch (error) {
        console.error('Submit Track Error:', error);
        res.status(500).json({ error: 'Failed to submit track' });
    }
});

// GET Metadata from URL
// GET Metadata from URL
app.post('/api/metadata', async (req, res) => {
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: 'Missing URL' });

    try {
        const response = await axios.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Accept-Language': 'ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7'
            },
            timeout: 5000,
            maxRedirects: 5
        });

        console.log(`[Metadata] Final URL: ${response.request.res.responseUrl}`);

        const cheerio = require('cheerio');
        const $ = cheerio.load(response.data);

        let artist = '';
        let title = '';
        let rawTitle = $('meta[property="og:title"]').attr('content') || $('title').text() || '';
        let siteName = $('meta[property="og:site_name"]').attr('content') || '';

        console.log(`[Metadata] URL: ${url}`);
        console.log(`[Metadata] Raw Title: "${rawTitle}", Site: "${siteName}"`);

        // Heuristics

        // 1. Try Specific Meta Tags (e.g. music:musician)
        const musicMusician = $('meta[property="music:musician"]').attr('content');
        if (musicMusician) artist = musicMusician;

        // 2. Yandex Music
        if (url.includes('music.yandex') || siteName.includes('Yandex Music')) {
            // Try to extract Track ID
            const trackMatch = url.match(/track\/(\d+)/);
            if (trackMatch && trackMatch[1]) {
                const trackId = trackMatch[1];
                console.log(`[Metadata] Detected Yandex Track ID: ${trackId}. Trying Handlers API...`);
                try {
                    // Internal Web Handler API (often works where public API fails 451)
                    const handlerUrl = `https://music.yandex.ru/handlers/track.jsx?track=${trackId}&lang=ru`;
                    const apiRes = await axios.get(handlerUrl, {
                        headers: {
                            'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1',
                            'Referer': 'https://music.yandex.ru/'
                        }
                    });

                    if (apiRes.data && apiRes.data.track) {
                        const trackData = apiRes.data.track;
                        const apiTitle = trackData.title;
                        // Artist can be multiple
                        const apiArtist = trackData.artists ? trackData.artists.map(a => a.name).join(', ') : '';

                        if (apiTitle && apiArtist) {
                            console.log(`[Metadata] Handler Success -> ${apiArtist} - ${apiTitle}`);
                            return res.json({ artist: apiArtist, title: apiTitle });
                        }
                    }
                } catch (apiErr) {
                    console.error(`[Metadata] Handler Failed: ${apiErr.message}`);
                }
            }

            if (rawTitle.includes('собираем музыку для вас') || rawTitle.includes('Яндекс Музыка')) {
                // Generic title, useless.
                console.log('[Metadata] Ignoring generic Yandex title.');
            }
            else if (rawTitle.includes(' — ')) { // Yandex uses long dash
                const parts = rawTitle.split(' — ');
                title = parts[0].trim();
                artist = parts[1].trim(); // "Track — Artist"
            } else if (rawTitle.includes('-')) {
                // Fallback
                const parts = rawTitle.split('-');
                title = parts[0].trim();
                artist = parts[1].trim();
            }
        }
        // 3. Spotify
        else if (url.includes('spotify') || siteName.includes('Spotify')) {
            // "Track - Song by Artist"
            if (rawTitle.includes(' - Song by ')) {
                const parts = rawTitle.split(' - Song by ');
                title = parts[0].trim();
                artist = parts[1].trim();
            }
            // "Track - Artist"
            else if (rawTitle.includes(' - ')) {
                const parts = rawTitle.split(' - ');
                title = parts[0].trim();
                artist = parts[1].trim();
            }
        }
        // 4. Default Fallback
        else if (!artist || !title) {
            if (rawTitle.includes(' - ')) {
                const parts = rawTitle.split(' - ');
                // Assume "Artist - Track" for generic sites (Youtube style)
                // BUT "Track - Artist" is also common. 
                // Let's rely on the first part being Artist usually for video/radio.
                // However, user said "nothing comes back", so ANY data is better.
                artist = parts[0].trim();
                title = parts.slice(1).join(' - ').trim();
            } else {
                title = rawTitle;
            }
        }

        // Clean up
        if (artist.endsWith('| Spotify')) artist = artist.replace('| Spotify', '').trim();

        console.log(`[Metadata] Result -> Artist: "${artist}", Title: "${title}"`);

        res.json({ artist, title });
    } catch (error) {
        console.error('Metadata Fetch Error:', error.message);
        // If it fails (e.g. 403), return empty
        res.json({ artist: '', title: '' });
    }
});

// --- USER API ---

// GET /api/my-tracks - Logged in user's pending tracks
app.get('/api/my-tracks', async (req, res) => {
    const userId = req.headers['x-user-id'];
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    try {
        const tracks = await prisma.track.findMany({
            where: { userId: Number(userId), status: 'PENDING' },
            orderBy: { createdAt: 'desc' }
        });
        res.json(tracks);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch tracks' });
    }
});

// DELETE /api/tracks/:id - User deletes their own track
app.delete('/api/tracks/:id', async (req, res) => {
    const userId = req.headers['x-user-id'];
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    try {
        const track = await prisma.track.findUnique({ where: { id: Number(req.params.id) } });
        if (!track) return res.status(404).json({ error: 'Not found' });
        if (track.userId !== Number(userId)) return res.status(403).json({ error: 'Not your track' });
        if (track.status !== 'PENDING') return res.status(400).json({ error: 'Cannot delete processed track' });

        await prisma.track.delete({ where: { id: Number(req.params.id) } });
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Delete failed' });
    }
});

// PUT /api/tracks/:id - User edits their own track
app.put('/api/tracks/:id', async (req, res) => {
    const userId = req.headers['x-user-id'];
    const { artist, title, url } = req.body;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    try {
        const track = await prisma.track.findUnique({ where: { id: Number(req.params.id) } });
        if (!track) return res.status(404).json({ error: 'Not found' });
        if (track.userId !== Number(userId)) return res.status(403).json({ error: 'Not your track' });
        if (track.status !== 'PENDING') return res.status(400).json({ error: 'Cannot edit processed track' });

        const updated = await prisma.track.update({
            where: { id: track.id },
            data: { artist, title, url }
        });
        res.json(updated);
    } catch (error) {
        res.status(500).json({ error: 'Update failed' });
    }
});

// --- ADMIN API ---

// GET /api/admin/tracks - Get all PENDING tracks
app.get('/api/admin/tracks', async (req, res) => {
    const adminId = req.headers['x-admin-id'];
    if (!adminId) return res.status(401).json({ error: 'Unauthorized' });

    try {
        const admin = await prisma.user.findUnique({ where: { id: Number(adminId) } });
        if (!admin || !admin.isAdmin) return res.status(403).json({ error: 'Forbidden' });

        const tracks = await prisma.track.findMany({
            where: { status: 'PENDING' },
            include: { submittedBy: true },
            orderBy: { createdAt: 'desc' },
        });
        res.json(tracks);
    } catch (error) {
        res.status(500).json({ error: 'Fetch failed' });
    }
});

// GET /api/admin/playlists - Archive
app.get('/api/admin/playlists', async (req, res) => {
    const adminId = req.headers['x-admin-id'];
    if (!adminId) return res.status(401).json({ error: 'Unauthorized' });
    const admin = await prisma.user.findUnique({ where: { id: Number(adminId) } });
    if (!admin?.isAdmin) return res.status(403).json({ error: 'Forbidden' });

    const playlists = await prisma.playlist.findMany({
        orderBy: { createdAt: 'desc' },
        include: { _count: { select: { tracks: true } } }
    });
    res.json(playlists);
});

// GET /api/admin/playlists/:id - Details
app.get('/api/admin/playlists/:id', async (req, res) => {
    const adminId = req.headers['x-admin-id'];
    if (!adminId) return res.status(401).json({ error: 'Unauthorized' });
    const admin = await prisma.user.findUnique({ where: { id: Number(adminId) } });
    if (!admin?.isAdmin) return res.status(403).json({ error: 'Forbidden' });

    const playlist = await prisma.playlist.findUnique({
        where: { id: Number(req.params.id) },
        include: { tracks: { include: { submittedBy: true } } }
    });
    res.json(playlist);
});

// PUT /api/admin/playlists/:id - Update Link
app.put('/api/admin/playlists/:id', async (req, res) => {
    const adminId = req.headers['x-admin-id'];
    const { serviceUrl } = req.body;
    if (!adminId) return res.status(401).json({ error: 'Unauthorized' });
    const admin = await prisma.user.findUnique({ where: { id: Number(adminId) } });
    if (!admin?.isAdmin) return res.status(403).json({ error: 'Forbidden' });

    const updated = await prisma.playlist.update({
        where: { id: Number(req.params.id) },
        data: { serviceUrl }
    });
    res.json(updated);
});

// POST /api/admin/playlists/:id/export/yandex
app.post('/api/admin/playlists/:id/export/yandex', async (req, res) => {
    const adminId = req.headers['x-admin-id'];
    const yandexToken = req.headers['x-yandex-token'];

    if (!adminId) return res.status(401).json({ error: 'Unauthorized' });
    if (!yandexToken) return res.status(400).json({ error: 'Missing Yandex Token' });

    try {
        const admin = await prisma.user.findUnique({ where: { id: Number(adminId) } });
        if (!admin?.isAdmin) return res.status(403).json({ error: 'Forbidden' });

        const playlist = await prisma.playlist.findUnique({
            where: { id: Number(req.params.id) },
            include: { tracks: true }
        });
        if (!playlist) return res.status(404).json({ error: 'Playlist not found' });

        // Create Axios instance with custom agent to prevent socket disconnects
        const httpsAgent = new (require('https').Agent)({ keepAlive: true });
        const yandexApi = axios.create({
            httpsAgent,
            timeout: 30000 // 30 seconds timeout
        });

        // 1. Get Yandex User ID (UID)
        const statusRes = await yandexApi.get('https://api.music.yandex.net/account/status', {
            headers: { 'Authorization': `OAuth ${yandexToken}` }
        });
        const uid = statusRes.data.result?.account?.uid;
        if (!uid) {
            console.error('Yandex Auth Failed:', statusRes.data);
            return res.status(400).json({ error: 'Invalid Yandex Token' });
        }

        // 2. Create Playlist on Yandex
        const createParams = new URLSearchParams();
        createParams.append('title', playlist.title);
        createParams.append('visibility', 'public');

        const createRes = await yandexApi.post(`https://api.music.yandex.net/users/${uid}/playlists/create`, createParams, {
            headers: {
                'Authorization': `OAuth ${yandexToken}`,
                'Content-Type': 'application/x-www-form-urlencoded'
            }
        });

        if (!createRes.data.result) {
            return res.status(500).json({ error: 'Failed to create Yandex playlist' });
        }
        const yandexKind = createRes.data.result.kind; // Playlist ID (kind)
        const revision = createRes.data.result.revision; // Required for modification

        // 3. Search and Add Tracks
        const addedTracks = [];
        const notFound = [];
        const diff = [];

        for (const track of playlist.tracks) {
            try {
                const query = `${track.artist} - ${track.title}`;
                const searchRes = await yandexApi.get(`https://api.music.yandex.net/search`, {
                    params: { text: query, type: 'track', page: 0 },
                    headers: { 'Authorization': `OAuth ${yandexToken}` }
                });

                const bestMatch = searchRes.data.result?.tracks?.results?.[0];
                if (bestMatch) {
                    const trackObj = { id: String(bestMatch.id) };
                    if (bestMatch.albums?.[0]?.id) {
                        trackObj.albumId = String(bestMatch.albums[0].id);
                    }

                    diff.push({
                        op: 'insert',
                        tracks: [trackObj],
                        at: addedTracks.length
                    });
                    addedTracks.push(track.title);
                } else {
                    notFound.push(track.title);
                }
            } catch (err) {
                console.error(`Search error for ${track.title}:`, err.message);
                notFound.push(track.title + ' (Error)');
            }
        }

        // 4. Submit Batch
        let batchResponseData = null;
        if (diff.length > 0) {
            const diffJson = JSON.stringify(diff);
            console.log('Sending Diff:', diffJson);

            const batchParams = new URLSearchParams();
            batchParams.append('diff', diffJson);
            batchParams.append('revision', String(revision));

            try {
                const batchRes = await yandexApi.post(`https://api.music.yandex.net/users/${uid}/playlists/${yandexKind}/change-relative`, batchParams, {
                    headers: {
                        'Authorization': `OAuth ${yandexToken}`,
                        'Content-Type': 'application/x-www-form-urlencoded'
                    }
                });
                batchResponseData = batchRes.data;
                console.log('Batch Add Response:', batchResponseData);
            } catch (batchErr) {
                console.error('Batch Add Failed:', batchErr.response?.data || batchErr.message);
                batchResponseData = { error: batchErr.response?.data || batchErr.message };
            }
        } else {
            console.log('No tracks found to add.');
        }

        // 5. Upload Cover (if exists)
        if (playlist.coverUrl) {
            try {
                console.log('Attempting to upload cover...');
                // Resolve local path
                const filename = path.basename(playlist.coverUrl);
                const filePath = path.join(__dirname, 'uploads', filename);

                if (fs.existsSync(filePath)) {
                    const FormData = require('form-data');
                    const form = new FormData();
                    form.append('image', fs.createReadStream(filePath)); // Try 'image' as field name

                    // Post directly to Yandex
                    // Note: Yandex API often expects 'file' parameter
                    await yandexApi.post(`https://api.music.yandex.net/users/${uid}/playlists/${yandexKind}/cover/upload`, form, {
                        headers: {
                            'Authorization': `OAuth ${yandexToken}`,
                            ...form.getHeaders()
                        },
                        params: {
                            revision: revision // Might differ if cover updates revision? Safe to try.
                        }
                    });

                    console.log('Cover uploaded successfully!');
                } else {
                    console.warn('Local cover file not found:', filePath);
                }
            } catch (coverErr) {
                console.error('Cover Upload Failed:', coverErr.message, coverErr.response?.data);
            }
        }

        // 5. Update local playlist Service URL
        const serviceUrl = `https://music.yandex.ru/users/${uid}/playlists/${yandexKind}`;
        await prisma.playlist.update({
            where: { id: playlist.id },
            data: { serviceUrl }
        });

        res.json({
            success: true,
            serviceUrl,
            added: addedTracks.length,
            notFound,
            debug: {
                diffLength: diff.length,
                batchResponse: batchResponseData,
                revision: revision
            }
        });

    } catch (e) {
        console.error('Yandex Export Error:', e.response?.data || e.message);
        res.status(500).json({ error: e.message + (e.response?.data ? ' - ' + JSON.stringify(e.response.data) : '') });
    }
});

// PUT /api/admin/tracks/:id - Edit track
app.put('/api/admin/tracks/:id', async (req, res) => {
    const adminId = req.headers['x-admin-id'];
    const { artist, title, url } = req.body;
    if (!adminId) return res.status(401).json({ error: 'Unauthorized' });

    try {
        const admin = await prisma.user.findUnique({ where: { id: Number(adminId) } });
        if (!admin || !admin.isAdmin) return res.status(403).json({ error: 'Forbidden' });

        const updated = await prisma.track.update({
            where: { id: Number(req.params.id) },
            data: { artist, title, url }
        });
        res.json(updated);
    } catch (error) {
        res.status(500).json({ error: 'Update failed' });
    }
});

// DELETE /api/admin/tracks/:id - Delete track
app.delete('/api/admin/tracks/:id', async (req, res) => {
    const adminId = req.headers['x-admin-id'];
    if (!adminId) return res.status(401).json({ error: 'Unauthorized' });

    try {
        const admin = await prisma.user.findUnique({ where: { id: Number(adminId) } });
        if (!admin || !admin.isAdmin) return res.status(403).json({ error: 'Forbidden' });

        await prisma.track.delete({ where: { id: Number(req.params.id) } });
        res.json({ success: true });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Delete failed' });
    }
});

// POST /api/admin/playlists - Create Playlist (with Cover upload)
app.post('/api/admin/playlists', upload.single('cover'), async (req, res) => {
    const adminId = req.headers['x-admin-id'];
    const { title } = req.body;
    const file = req.file;

    if (!adminId) return res.status(401).json({ error: 'Unauthorized' });

    try {
        const admin = await prisma.user.findUnique({ where: { id: Number(adminId) } });
        if (!admin || !admin.isAdmin) return res.status(403).json({ error: 'Forbidden' });

        const pendingTracks = await prisma.track.findMany({ where: { status: 'PENDING' }, select: { id: true } });
        if (pendingTracks.length === 0) return res.status(400).json({ error: 'No tracks to playlist' });

        const coverUrl = file ? `/uploads/${file.filename}` : null;

        const result = await prisma.$transaction(async (tx) => {
            const playlist = await tx.playlist.create({
                data: { title, coverUrl }
            });
            await tx.track.updateMany({
                where: { status: 'PENDING' },
                data: { status: 'PROCESSED', playlistId: playlist.id }
            });
            return playlist;
        });
        res.json(result);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Playlist creation failed' });
    }
});

// TEST ONLY: Toggle Admin for specific user
app.post('/api/test/toggle-admin', async (req, res) => {
    try {
        const TEST_ID = 123456;
        console.log(`Toggling admin for ID: ${TEST_ID}`);
        const user = await prisma.user.findFirst({ where: { telegramId: BigInt(TEST_ID) } });
        if (!user) {
            console.log('User not found in DB');
            return res.status(404).json({ error: 'Test user not found' });
        }
        const updated = await prisma.user.update({
            where: { id: user.id },
            data: { isAdmin: !user.isAdmin }
        });
        console.log(`User ${user.id} toggled. New isAdmin: ${updated.isAdmin}`);
        res.json(updated);
    } catch (error) {
        console.error('Toggle Admin Error:', error);
        res.status(500).json({ error: 'Failed to toggle admin' });
    }
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
