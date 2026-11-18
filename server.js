const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { URL } = require('node:url');
const { db } = require('./src/db.js');

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

function getSessionToken(req) {
    const cookies = parseCookies(req);
    if (cookies.session_id) {
        return cookies.session_id;
    }
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
        return authHeader.substring(7).trim();
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
    // CORS headers for local dev convenience
    res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
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
    server.listen(PORT, () => {
        console.log(`========================================`);
        console.log(` ♟️  Шахматный сервер запущен!`);
        console.log(` 🌐 Адрес: http://localhost:${PORT}`);
        console.log(` 📁 База данных: data/users_db.json`);
        console.log(`========================================`);
    });
}

module.exports = server;
