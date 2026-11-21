const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { URL } = require('node:url');
const { db } = require('./src/db.js');
const { rooms } = require('./src/rooms.js');

const PORT = parseInt(process.env.PORT, 10) || 3000;
const PUBLIC_DIR = __dirname;

const MIME_TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon'
};

function parseCookies(req) {
    const list = {};
    const cookieHeader = req.headers.cookie;
    if (!cookieHeader) return list;

    cookieHeader.split(';').forEach(cookie => {
        const parts = cookie.split('=');
        const key = parts.shift().trim();
        const value = decodeURIComponent(parts.join('='));
        if (key) list[key] = value;
    });
    return list;
}

function getSessionToken(req, parsedUrl = null) {
    const cookies = parseCookies(req);
    if (cookies.session_id) {
        return cookies.session_id;
    }
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
        return authHeader.substring(7).trim();
    }
    if (parsedUrl && parsedUrl.searchParams) {
        const queryToken = parsedUrl.searchParams.get('token');
        if (queryToken) return queryToken.trim();
    }
    return null;
}

function sendJson(res, statusCode, data, headers = {}) {
    res.writeHead(statusCode, {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
        ...headers
    });
    res.end(JSON.stringify(data));
}

function parseJsonBody(req) {
    return new Promise((resolve, reject) => {
        let body = '';
        req.on('data', chunk => {
            body += chunk;
            if (body.length > 2 * 1024 * 1024) { // 2MB limit
                req.destroy();
                reject(new Error('Payload too large'));
            }
        });
        req.on('end', () => {
            if (!body) {
                resolve({});
                return;
            }
            try {
                resolve(JSON.parse(body));
            } catch (e) {
                reject(new Error('Некорректный JSON в запросе'));
            }
        });
        req.on('error', reject);
    });
}

function serveStatic(req, res, pathname) {
    // Prevent accessing private database files
    const normalized = path.normalize(pathname).replace(/^(\.\.[\/\\])+/, '');
    if (normalized.startsWith('data' + path.sep) || normalized === 'data') {
        res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Access Denied');
        return;
    }

    let filePath = path.join(PUBLIC_DIR, normalized === '/' || normalized === '' ? 'index.html' : normalized);

    // Prevent directory traversal
    if (!filePath.startsWith(PUBLIC_DIR)) {
        res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Forbidden');
        return;
    }

    fs.stat(filePath, (err, stats) => {
        if (err || !stats.isFile()) {
            res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
            res.end('404 Not Found');
            return;
        }

        const ext = path.extname(filePath).toLowerCase();
        const contentType = MIME_TYPES[ext] || 'application/octet-stream';

        res.writeHead(200, {
            'Content-Type': contentType,
            'Content-Length': stats.size,
            'Cache-Control': ext === '.png' ? 'public, max-age=86400' : 'no-cache'
        });

        const stream = fs.createReadStream(filePath);
        stream.pipe(res);
    });
}

const server = http.createServer(async (req, res) => {
    // CORS & Private Network Access headers
    const origin = req.headers.origin;
    if (origin && origin !== 'null') {
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Access-Control-Allow-Credentials', 'true');
    } else {
        res.setHeader('Access-Control-Allow-Origin', '*');
    }
    res.setHeader('Access-Control-Allow-Private-Network', 'true');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
    }

    const host = req.headers.host || `localhost:${PORT}`;
    const parsedUrl = new URL(req.url, `http://${host}`);
    const pathname = parsedUrl.pathname;

    try {
        // Health check for Render / cloud orchestrators
        if ((pathname === '/healthz' || pathname === '/health') && req.method === 'GET') {
            return sendJson(res, 200, { status: 'ok', timestamp: Date.now() });
        }

        // --- API ROUTES ---

        // 1. Check if username exists (GET /api/auth/check-username?username=...)
        if (pathname === '/api/auth/check-username' && req.method === 'GET') {
            const username = parsedUrl.searchParams.get('username') || '';
            const trimmed = username.trim();

            if (!trimmed) {
                return sendJson(res, 200, {
                    exists: false,
                    valid: false,
                    message: 'Введите имя пользователя.'
                });
            }

            if (trimmed.length < 3 || trimmed.length > 25) {
                return sendJson(res, 200, {
                    exists: false,
                    valid: false,
                    message: 'Имя должно содержать от 3 до 25 символов.'
                });
            }

            if (!/^[a-zA-Z0-9_а-яА-ЯёЁ-]+$/.test(trimmed)) {
                return sendJson(res, 200, {
                    exists: false,
                    valid: false,
                    message: 'Только буквы, цифры, дефис и подчеркивание.'
                });
            }

            const exists = db.userExists(trimmed);
            return sendJson(res, 200, {
                exists,
                valid: true,
                message: exists ? 'Аккаунт с таким именем уже существует' : 'Имя пользователя свободно'
            });
        }

        // 2. Register (POST /api/auth/register)
        if (pathname === '/api/auth/register' && req.method === 'POST') {
            const body = await parseJsonBody(req);
            const { username, password } = body;

            try {
                const { user, token } = await db.registerUser(username, password);
                return sendJson(res, 201, {
                    success: true,
                    user,
                    token,
                    message: `Регистрация успешна! Добро пожаловать, ${user.username}.`
                }, {
                    'Set-Cookie': `session_id=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000`
                });
            } catch (err) {
                const status = err.message.includes('уже существует') ? 409 : 400;
                return sendJson(res, status, {
                    success: false,
                    error: err.message
                });
            }
        }

        // 3. Login (POST /api/auth/login)
        if (pathname === '/api/auth/login' && req.method === 'POST') {
            const body = await parseJsonBody(req);
            const { username, password } = body;

            try {
                const { user, token } = await db.authenticateUser(username, password);
                return sendJson(res, 200, {
                    success: true,
                    user,
                    token,
                    message: `С возвращением, ${user.username}!`
                }, {
                    'Set-Cookie': `session_id=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000`
                });
            } catch (err) {
                const status = err.code === 'USER_NOT_FOUND' ? 404 : 401;
                return sendJson(res, status, {
                    success: false,
                    error: err.message,
                    code: err.code
                });
            }
        }

        // 4. Current user session (GET /api/auth/me)
        if (pathname === '/api/auth/me' && req.method === 'GET') {
            const token = getSessionToken(req);
            const user = db.getUserBySession(token);

            if (!user) {
                return sendJson(res, 200, {
                    authenticated: false,
                    user: null
                });
            }

            return sendJson(res, 200, {
                authenticated: true,
                user
            });
        }

        // 5. Logout (POST /api/auth/logout)
        if (pathname === '/api/auth/logout' && req.method === 'POST') {
            const token = getSessionToken(req);
            if (token) {
                await db.deleteSession(token);
            }

            return sendJson(res, 200, {
                success: true,
                message: 'Сеанс завершен.'
            }, {
                'Set-Cookie': 'session_id=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT'
            });
        }

        // 6. Save game to user's cloud profile (POST /api/user/save-game)
        if (pathname === '/api/user/save-game' && req.method === 'POST') {
            const token = getSessionToken(req);
            const user = db.getUserBySession(token);
            if (!user) {
                return sendJson(res, 401, {
                    success: false,
                    error: 'Необходимо войти в аккаунт для сохранения в базу данных.'
                });
            }

            const body = await parseJsonBody(req);
            if (!body.gameState) {
                return sendJson(res, 400, {
                    success: false,
                    error: 'Отсутствуют данные партии gameState.'
                });
            }

            const saved = await db.saveUserGame(db.normalizeUsername(user.username), body.gameState);
            return sendJson(res, 200, {
                success: true,
                message: 'Партия успешно сохранена в вашем профиле!',
                savedGame: saved
            });
        }

        // 7. Load game from user profile (GET /api/user/load-game)
        if (pathname === '/api/user/load-game' && req.method === 'GET') {
            const token = getSessionToken(req);
            const user = db.getUserBySession(token);
            if (!user) {
                return sendJson(res, 401, {
                    success: false,
                    error: 'Необходимо войти в аккаунт.'
                });
            }

            return sendJson(res, 200, {
                success: true,
                savedGame: user.savedGame
            });
        }

        // 8. Record game result (win/loss/draw) (POST /api/user/record-result)
        if (pathname === '/api/user/record-result' && req.method === 'POST') {
            const token = getSessionToken(req);
            const user = db.getUserBySession(token);
            if (!user) {
                return sendJson(res, 401, {
                    success: false,
                    error: 'Необходимо войти в аккаунт.'
                });
            }

            const body = await parseJsonBody(req);
            const outcome = body.outcome; // 'win' | 'loss' | 'draw'
            if (!['win', 'loss', 'draw'].includes(outcome)) {
                return sendJson(res, 400, {
                    success: false,
                    error: 'Неверный результат партии (ожидается win, loss или draw).'
                });
            }

            const updatedStats = await db.recordGameResult(db.normalizeUsername(user.username), outcome);
            return sendJson(res, 200, {
                success: true,
                stats: updatedStats
            });
        }

        // 9. Get user game history (GET /api/user/games)
        if (pathname === '/api/user/games' && req.method === 'GET') {
            const token = getSessionToken(req, parsedUrl);
            const user = db.getUserBySession(token);
            if (!user) {
                return sendJson(res, 401, {
                    success: false,
                    error: 'Необходимо войти в аккаунт.'
                });
            }

            const games = db.getUserGames(db.normalizeUsername(user.username));
            return sendJson(res, 200, {
                success: true,
                username: user.username,
                stats: user.stats,
                records: user.records || {},
                games
            });
        }

        // 10. Record local game into user profile (POST /api/user/record-game)
        if (pathname === '/api/user/record-game' && req.method === 'POST') {
            const token = getSessionToken(req, parsedUrl);
            const user = db.getUserBySession(token);
            if (!user) {
                return sendJson(res, 401, {
                    success: false,
                    error: 'Необходимо войти в аккаунт.'
                });
            }

            const body = await parseJsonBody(req);
            const { outcome, reason, movesCount } = body;
            if (!['win', 'loss', 'draw'].includes(outcome)) {
                return sendJson(res, 400, {
                    success: false,
                    error: 'Неверный результат партии.'
                });
            }

            const result = await db.recordLocalGame(db.normalizeUsername(user.username), {
                outcome,
                reason,
                movesCount
            });

            return sendJson(res, 200, {
                success: true,
                ...result
            });
        }

        // --- ONLINE MULTIPLAYER ROOMS API ---

        // 11. Create room with generated code (POST /api/rooms/create)
        if (pathname === '/api/rooms/create' && req.method === 'POST') {
            const token = getSessionToken(req, parsedUrl);
            const user = db.getUserBySession(token);
            if (!user) {
                return sendJson(res, 401, {
                    success: false,
                    error: 'Для создания онлайн-игры необходимо войти в аккаунт.'
                });
            }

            try {
                const roomData = rooms.createRoom(user);
                return sendJson(res, 201, {
                    success: true,
                    room: roomData
                });
            } catch (err) {
                return sendJson(res, 400, {
                    success: false,
                    error: err.message
                });
            }
        }

        // 12. Join room by code (POST /api/rooms/join)
        if (pathname === '/api/rooms/join' && req.method === 'POST') {
            const token = getSessionToken(req, parsedUrl);
            const user = db.getUserBySession(token);
            if (!user) {
                return sendJson(res, 401, {
                    success: false,
                    error: 'Для присоединения к игре необходимо войти в аккаунт.'
                });
            }

            const body = await parseJsonBody(req);
            const code = body.code;
            if (!code) {
                return sendJson(res, 400, {
                    success: false,
                    error: 'Укажите код комнаты.'
                });
            }

            try {
                const joined = rooms.joinRoom(code, user);
                return sendJson(res, 200, {
                    success: true,
                    ...joined
                });
            } catch (err) {
                const status = (err.code === 'ROOM_NOT_FOUND') ? 404 : 400;
                return sendJson(res, status, {
                    success: false,
                    error: err.message,
                    code: err.code
                });
            }
        }

        // Match /api/rooms/:code/*
        const roomMatch = pathname.match(/^\/api\/rooms\/([A-Za-z0-9]+)(\/.*)?$/);
        if (roomMatch) {
            const roomCode = roomMatch[1].toUpperCase();
            const subpath = roomMatch[2] || '';

            // 13. Room SSE Stream (GET /api/rooms/:code/events)
            if (subpath === '/events' && req.method === 'GET') {
                const token = getSessionToken(req, parsedUrl);
                const user = db.getUserBySession(token);
                if (!user) {
                    res.writeHead(401, { 'Content-Type': 'application/json; charset=utf-8' });
                    res.end(JSON.stringify({ success: false, error: 'Требуется авторизация.' }));
                    return;
                }

                return rooms.addSSEClient(roomCode, res, user);
            }

            // 14. Get Room State (GET /api/rooms/:code)
            if ((subpath === '' || subpath === '/') && req.method === 'GET') {
                const token = getSessionToken(req, parsedUrl);
                const user = db.getUserBySession(token);
                const room = rooms.getRoom(roomCode);

                if (!room) {
                    return sendJson(res, 404, {
                        success: false,
                        error: `Комната "${roomCode}" не найдена.`
                    });
                }

                return sendJson(res, 200, {
                    success: true,
                    room: rooms.getPublicRoom(room, user)
                });
            }

            // 15. Make Move in Room (POST /api/rooms/:code/move)
            if (subpath === '/move' && req.method === 'POST') {
                const token = getSessionToken(req, parsedUrl);
                const user = db.getUserBySession(token);
                if (!user) {
                    return sendJson(res, 401, {
                        success: false,
                        error: 'Необходимо войти в аккаунт.'
                    });
                }

                const body = await parseJsonBody(req);
                const { from, to, promotionChoice } = body;

                if (!from || !to) {
                    return sendJson(res, 400, {
                        success: false,
                        error: 'Укажите координаты from и to.'
                    });
                }

                try {
                    const result = await rooms.handleMove(roomCode, user, from, to, promotionChoice);
                    return sendJson(res, 200, result);
                } catch (err) {
                    return sendJson(res, 400, {
                        success: false,
                        error: err.message,
                        code: err.code
                    });
                }
            }

            // 16. Resign in Room (POST /api/rooms/:code/resign)
            if (subpath === '/resign' && req.method === 'POST') {
                const token = getSessionToken(req, parsedUrl);
                const user = db.getUserBySession(token);
                if (!user) {
                    return sendJson(res, 401, {
                        success: false,
                        error: 'Необходимо войти в аккаунт.'
                    });
                }

                try {
                    const result = await rooms.handleResign(roomCode, user);
                    return sendJson(res, 200, result);
                } catch (err) {
                    return sendJson(res, 400, {
                        success: false,
                        error: err.message,
                        code: err.code
                    });
                }
            }
        }

        // --- LEADERBOARD & RECORDS API ---

        // 17. Leaderboard rankings (GET /api/leaderboard)
        if (pathname === '/api/leaderboard' && req.method === 'GET') {
            const limit = Math.min(Math.max(parseInt(parsedUrl.searchParams.get('limit') || '10', 10), 1), 50);
            const leaderboards = db.getLeaderboards(limit);

            const token = getSessionToken(req, parsedUrl);
            const currentUser = db.getUserBySession(token);
            let userRank = null;
            if (currentUser) {
                userRank = db.getUserLeaderboardRank(currentUser.username);
            }

            return sendJson(res, 200, {
                success: true,
                leaderboards,
                userRank
            });
        }

        // --- STATIC FILE SERVING ---
        if (req.method === 'GET') {
            return serveStatic(req, res, pathname);
        }

        return sendJson(res, 405, { success: false, error: 'Метод не поддерживается.' });
    } catch (err) {
        console.error('[SERVER ERROR]', err);
        return sendJson(res, 500, {
            success: false,
            error: 'Внутренняя ошибка сервера: ' + err.message
        });
    }
});

if (require.main === module) {
    (async () => {
        try {
            await db.init();
        } catch (err) {
            console.error('[DB Startup Error]', err);
        }
        server.listen(PORT, '0.0.0.0', () => {
            console.log(`========================================`);
            console.log(` ♟️  Шахматный сервер запущен!`);
            console.log(` 🌐 Адрес: http://0.0.0.0:${PORT}`);
            console.log(` 📁 База данных: ${process.env.DATABASE_URL ? 'PostgreSQL' : 'data/users_db.json'}`);
            console.log(`========================================`);
        });
    })();
}

module.exports = server;
