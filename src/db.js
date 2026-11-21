const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

let pg = null;
try {
    pg = require('pg');
} catch (e) {
    // pg is optional for offline/local JSON testing
}

const DB_PATH = path.join(__dirname, '..', 'data', 'users_db.json');

class JsonDatabase {
    constructor(filePath = DB_PATH, options = {}) {
        this.filePath = filePath;
        this.databaseUrl = options.databaseUrl || process.env.DATABASE_URL || null;
        this.data = {
            users: {},
            sessions: {}
        };
        this.isWriting = false;
        this.writeQueue = [];
        this.pgPool = null;
        this.isPostgres = Boolean(this.databaseUrl && pg);

        if (this.isPostgres) {
            const sslOption = this.databaseUrl.includes('localhost') ? false : { rejectUnauthorized: false };
            this.pgPool = new pg.Pool({
                connectionString: this.databaseUrl,
                ssl: sslOption
            });
        }

        this.load();
    }

    async init() {
        if (!this.isPostgres || !this.pgPool) {
            return;
        }

        try {
            await this.pgPool.query(`
                CREATE TABLE IF NOT EXISTS chess_users (
                    username_key TEXT PRIMARY KEY,
                    data JSONB NOT NULL
                );
                CREATE TABLE IF NOT EXISTS chess_sessions (
                    token TEXT PRIMARY KEY,
                    data JSONB NOT NULL
                );
            `);

            const usersRes = await this.pgPool.query('SELECT username_key, data FROM chess_users');
            const sessionsRes = await this.pgPool.query('SELECT token, data FROM chess_sessions');

            for (const row of usersRes.rows) {
                this.data.users[row.username_key] = row.data;
            }
            for (const row of sessionsRes.rows) {
                this.data.sessions[row.token] = row.data;
            }

            console.log(`[DB] Connected to PostgreSQL. Loaded ${usersRes.rows.length} users and ${sessionsRes.rows.length} sessions.`);

            if (usersRes.rows.length === 0 && Object.keys(this.data.users).length > 0) {
                console.log(`[DB] Migrating ${Object.keys(this.data.users).length} local users into PostgreSQL...`);
                await this.persistToPostgres();
                console.log(`[DB] Migration to PostgreSQL completed.`);
            }
        } catch (err) {
            console.error('[DB] PostgreSQL init failed:', err.message);
        }
    }

    async persistToPostgres() {
        if (!this.isPostgres || !this.pgPool) return;
        const client = await this.pgPool.connect();
        try {
            await client.query('BEGIN');
            for (const [key, user] of Object.entries(this.data.users)) {
                await client.query(
                    `INSERT INTO chess_users (username_key, data)
                     VALUES ($1, $2)
                     ON CONFLICT (username_key) DO UPDATE SET data = $2`,
                    [key, JSON.stringify(user)]
                );
            }
            for (const [token, sess] of Object.entries(this.data.sessions)) {
                await client.query(
                    `INSERT INTO chess_sessions (token, data)
                     VALUES ($1, $2)
                     ON CONFLICT (token) DO UPDATE SET data = $2`,
                    [token, JSON.stringify(sess)]
                );
            }
            const activeTokens = Object.keys(this.data.sessions);
            if (activeTokens.length > 0) {
                await client.query(
                    `DELETE FROM chess_sessions WHERE NOT (token = ANY($1))`,
                    [activeTokens]
                );
            } else {
                await client.query(`DELETE FROM chess_sessions`);
            }
            await client.query('COMMIT');
        } catch (err) {
            await client.query('ROLLBACK');
            console.error('[DB] Error saving to PostgreSQL:', err.message);
        } finally {
            client.release();
        }
    }

    async close() {
        if (this.pgPool) {
            await this.pgPool.end();
        }
    }

    load() {
        try {
            const dir = path.dirname(this.filePath);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }

            if (fs.existsSync(this.filePath)) {
                const raw = fs.readFileSync(this.filePath, 'utf8');
                const parsed = JSON.parse(raw);
                this.data = {
                    users: parsed.users || {},
                    sessions: parsed.sessions || {}
                };
            } else {
                this.saveSync();
            }
        } catch (err) {
            console.error('[DB] Failed to load JSON database, initializing empty:', err.message);
            this.data = { users: {}, sessions: {} };
        }
    }

    saveSync() {
        const dir = path.dirname(this.filePath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        const tempPath = `${this.filePath}.${Date.now()}.tmp`;
        fs.writeFileSync(tempPath, JSON.stringify(this.data, null, 2), 'utf8');
        fs.renameSync(tempPath, this.filePath);
    }

    async save() {
        if (this.isPostgres && this.pgPool) {
            try {
                await this.persistToPostgres();
            } catch (err) {
                console.error('[DB] Error persisting to PostgreSQL:', err.message);
            }
        }

        if (this.isWriting) {
            return new Promise((resolve, reject) => {
                this.writeQueue.push({ resolve, reject });
            });
        }

        this.isWriting = true;
        try {
            const dir = path.dirname(this.filePath);
            if (!fs.existsSync(dir)) {
                await fs.promises.mkdir(dir, { recursive: true });
            }
            const tempPath = `${this.filePath}.${Date.now()}.${Math.random().toString(36).substring(2, 7)}.tmp`;
            const json = JSON.stringify(this.data, null, 2);
            await fs.promises.writeFile(tempPath, json, 'utf8');
            await fs.promises.rename(tempPath, this.filePath);
        } catch (err) {
            console.error('[DB] Error saving JSON database:', err);
            throw err;
        } finally {
            this.isWriting = false;
            if (this.writeQueue.length > 0) {
                const next = this.writeQueue.shift();
                this.save().then(next.resolve).catch(next.reject);
            }
        }
    }

    normalizeUsername(username) {
        if (!username || typeof username !== 'string') return '';
        return username.trim().toLowerCase();
    }

    hashPassword(password, salt) {
        return crypto.scryptSync(password, salt, 64).toString('hex');
    }

    verifyPassword(password, storedHash, salt) {
        const hash = crypto.scryptSync(password, salt, 64);
        const storedBuffer = Buffer.from(storedHash, 'hex');
        if (hash.length !== storedBuffer.length) {
            return false;
        }
        return crypto.timingSafeEqual(hash, storedBuffer);
    }

    userExists(username) {
        const key = this.normalizeUsername(username);
        return Boolean(this.data.users[key]);
    }

    getUser(username) {
        const key = this.normalizeUsername(username);
        return this.data.users[key] || null;
    }

    getPublicUser(user) {
        if (!user) return null;
        return {
            id: user.id,
            username: user.username,
            createdAt: user.createdAt,
            stats: user.stats || { wins: 0, losses: 0, draws: 0, total: 0 },
            records: user.records || {},
            savedGame: user.savedGame || null,
            games: (user.games || []).slice(0, 50)
        };
    }

    async registerUser(username, password) {
        const trimmed = (username || '').trim();
        const key = this.normalizeUsername(trimmed);

        if (!key || key.length < 3 || key.length > 25) {
            throw new Error('Имя пользователя должно содержать от 3 до 25 символов.');
        }

        if (!/^[a-zA-Z0-9_а-яА-ЯёЁ-]+$/.test(trimmed)) {
            throw new Error('Имя пользователя может содержать только буквы, цифры, дефис и подчеркивание.');
        }

        if (!password || password.length < 4) {
            throw new Error('Пароль должен быть не менее 4 символов.');
        }

        if (this.data.users[key]) {
            throw new Error('Пользователь с таким именем уже существует.');
        }

        const salt = crypto.randomBytes(16).toString('hex');
        const passwordHash = this.hashPassword(password, salt);
        const now = new Date().toISOString();

        const user = {
            id: 'usr_' + crypto.randomBytes(8).toString('hex'),
            username: trimmed,
            usernameKey: key,
            passwordHash,
            salt,
            createdAt: now,
            stats: {
                wins: 0,
                losses: 0,
                draws: 0,
                total: 0
            },
            records: {},
            savedGame: null,
            games: []
        };

        this.data.users[key] = user;
        await this.save();

        const session = await this.createSession(key);
        return { user: this.getPublicUser(user), token: session.token };
    }

    async authenticateUser(username, password) {
        const trimmed = (username || '').trim();
        const key = this.normalizeUsername(trimmed);

        if (!key) {
            throw new Error('Введите имя пользователя.');
        }

        const user = this.data.users[key];
        if (!user) {
            const notFoundErr = new Error('Пользователь с таким именем не найден.');
            notFoundErr.code = 'USER_NOT_FOUND';
            throw notFoundErr;
        }

        const isValid = this.verifyPassword(password || '', user.passwordHash, user.salt);
        if (!isValid) {
            const invalidErr = new Error('Неверный пароль.');
            invalidErr.code = 'INVALID_PASSWORD';
            throw invalidErr;
        }

        const session = await this.createSession(key);
        return { user: this.getPublicUser(user), token: session.token };
    }

    async createSession(usernameKey) {
        const token = crypto.randomBytes(32).toString('hex');
        const expiresAt = Date.now() + 30 * 24 * 60 * 60 * 1000; // 30 days

        this.data.sessions[token] = {
            usernameKey,
            expiresAt
        };

        // Purge expired sessions
        this.cleanExpiredSessions();
        await this.save();

        return { token, expiresAt };
    }

    cleanExpiredSessions() {
        const now = Date.now();
        for (const token of Object.keys(this.data.sessions)) {
            if (this.data.sessions[token].expiresAt < now) {
                delete this.data.sessions[token];
            }
        }
    }

    getUserBySession(token) {
        if (!token) return null;
        const session = this.data.sessions[token];
        if (!session) return null;

        if (session.expiresAt < Date.now()) {
            delete this.data.sessions[token];
            this.save();
            return null;
        }

        const user = this.data.users[session.usernameKey];
        if (!user) return null;

        return this.getPublicUser(user);
    }

    async deleteSession(token) {
        if (token && this.data.sessions[token]) {
            delete this.data.sessions[token];
            await this.save();
            return true;
        }
        return false;
    }

    async saveUserGame(usernameKey, gameState) {
        const user = this.data.users[usernameKey];
        if (!user) {
            throw new Error('Пользователь не найден.');
        }

        user.savedGame = {
            state: gameState,
            savedAt: new Date().toISOString()
        };

        await this.save();
        return user.savedGame;
    }

    async recordGameResult(usernameKey, outcome) {
        const user = this.data.users[usernameKey];
        if (!user) return null;

        if (!user.stats) {
            user.stats = { wins: 0, losses: 0, draws: 0, total: 0 };
        }

        if (outcome === 'win') {
            user.stats.wins += 1;
        } else if (outcome === 'loss') {
            user.stats.losses += 1;
        } else if (outcome === 'draw') {
            user.stats.draws += 1;
        }
        user.stats.total += 1;

        await this.save();
        return user.stats;
    }

    async recordFinishedGame({ whiteUsername, blackUsername, winner, reason, movesCount, history, roomCode }) {
        const whiteKey = this.normalizeUsername(whiteUsername);
        const blackKey = this.normalizeUsername(blackUsername);
        const now = new Date().toISOString();
        const gameId = 'gm_' + crypto.randomBytes(6).toString('hex');

        // Determine outcome for white
        let whiteOutcome = 'draw';
        if (winner === 'white') whiteOutcome = 'win';
        else if (winner === 'black') whiteOutcome = 'loss';

        // Determine outcome for black
        let blackOutcome = 'draw';
        if (winner === 'black') blackOutcome = 'win';
        else if (winner === 'white') blackOutcome = 'loss';

        const whiteUser = this.data.users[whiteKey];
        if (whiteUser) {
            if (!whiteUser.games) whiteUser.games = [];
            if (!whiteUser.stats) whiteUser.stats = { wins: 0, losses: 0, draws: 0, total: 0 };
            if (!whiteUser.records) whiteUser.records = {};

            whiteUser.games.unshift({
                id: gameId,
                date: now,
                opponent: blackUsername || 'Соперник',
                color: 'white',
                result: whiteOutcome,
                winner: winner || 'draw',
                reason: reason || 'unknown',
                movesCount: typeof movesCount === 'number' ? movesCount : 0,
                roomCode: roomCode || null
            });
            if (whiteUser.games.length > 100) whiteUser.games.length = 100;

            if (whiteOutcome === 'win') {
                whiteUser.stats.wins += 1;
                if (reason === 'checkmate' && typeof movesCount === 'number' && movesCount > 0) {
                    const currentBest = whiteUser.records.fastestMate;
                    if (!currentBest || movesCount < currentBest.movesCount) {
                        whiteUser.records.fastestMate = {
                            movesCount,
                            fullMoves: Math.ceil(movesCount / 2),
                            opponent: blackUsername || 'Соперник',
                            date: now,
                            roomCode: roomCode || null,
                            gameId
                        };
                    }
                }
            } else if (whiteOutcome === 'loss') {
                whiteUser.stats.losses += 1;
            } else {
                whiteUser.stats.draws += 1;
            }
            whiteUser.stats.total += 1;
        }

        const blackUser = this.data.users[blackKey];
        if (blackUser) {
            if (!blackUser.games) blackUser.games = [];
            if (!blackUser.stats) blackUser.stats = { wins: 0, losses: 0, draws: 0, total: 0 };
            if (!blackUser.records) blackUser.records = {};

            blackUser.games.unshift({
                id: gameId,
                date: now,
                opponent: whiteUsername || 'Соперник',
                color: 'black',
                result: blackOutcome,
                winner: winner || 'draw',
                reason: reason || 'unknown',
                movesCount: typeof movesCount === 'number' ? movesCount : 0,
                roomCode: roomCode || null
            });
            if (blackUser.games.length > 100) blackUser.games.length = 100;

            if (blackOutcome === 'win') {
                blackUser.stats.wins += 1;
                if (reason === 'checkmate' && typeof movesCount === 'number' && movesCount > 0) {
                    const currentBest = blackUser.records.fastestMate;
                    if (!currentBest || movesCount < currentBest.movesCount) {
                        blackUser.records.fastestMate = {
                            movesCount,
                            fullMoves: Math.ceil(movesCount / 2),
                            opponent: whiteUsername || 'Соперник',
                            date: now,
                            roomCode: roomCode || null,
                            gameId
                        };
                    }
                }
            } else if (blackOutcome === 'loss') {
                blackUser.stats.losses += 1;
            } else {
                blackUser.stats.draws += 1;
            }
            blackUser.stats.total += 1;
        }

        await this.save();
        return {
            gameId,
            whiteStats: whiteUser ? whiteUser.stats : null,
            blackStats: blackUser ? blackUser.stats : null
        };
    }

    async recordLocalGame(usernameKey, { outcome, reason, movesCount }) {
        const user = this.data.users[usernameKey];
        if (!user) return null;

        if (!user.games) user.games = [];
        if (!user.stats) user.stats = { wins: 0, losses: 0, draws: 0, total: 0 };
        if (!user.records) user.records = {};

        const gameId = 'loc_' + crypto.randomBytes(6).toString('hex');
        const now = new Date().toISOString();

        user.games.unshift({
            id: gameId,
            date: now,
            opponent: 'Локальная партия',
            color: outcome === 'win' ? 'white' : 'unknown',
            result: outcome,
            winner: outcome === 'win' ? 'white' : (outcome === 'loss' ? 'black' : 'draw'),
            reason: reason || 'checkmate',
            movesCount: typeof movesCount === 'number' ? movesCount : 0,
            roomCode: null
        });
        if (user.games.length > 100) user.games.length = 100;

        if (outcome === 'win') {
            user.stats.wins += 1;
            if (reason === 'checkmate' && typeof movesCount === 'number' && movesCount > 0) {
                const currentBest = user.records.fastestMate;
                if (!currentBest || movesCount < currentBest.movesCount) {
                    user.records.fastestMate = {
                        movesCount,
                        fullMoves: Math.ceil(movesCount / 2),
                        opponent: 'Локальная партия',
                        date: now,
                        roomCode: null,
                        gameId
                    };
                }
            }
        } else if (outcome === 'loss') {
            user.stats.losses += 1;
        } else if (outcome === 'draw') {
            user.stats.draws += 1;
        }
        user.stats.total += 1;

        await this.save();
        return {
            stats: user.stats,
            games: user.games.slice(0, 50)
        };
    }

    getUserGames(usernameKey) {
        const user = this.data.users[usernameKey];
        if (!user) return [];
        return (user.games || []).slice(0, 50);
    }

    getLeaderboards(limit = 10) {
        const fastestMatesList = [];
        const userStatsList = [];

        for (const key of Object.keys(this.data.users)) {
            const user = this.data.users[key];
            if (!user) continue;

            const stats = user.stats || { wins: 0, losses: 0, draws: 0, total: 0 };
            const total = (stats.wins || 0) + (stats.losses || 0) + (stats.draws || 0);
            const winrate = total > 0 ? Math.round(((stats.wins || 0) / total) * 100) : 0;

            userStatsList.push({
                username: user.username,
                wins: stats.wins || 0,
                losses: stats.losses || 0,
                draws: stats.draws || 0,
                total: total || stats.total || 0,
                winrate,
                createdAt: user.createdAt
            });

            // Find best checkmate for this user: either from records.fastestMate or scan user.games
            let bestMate = user.records && user.records.fastestMate ? { ...user.records.fastestMate } : null;

            if (Array.isArray(user.games)) {
                for (const g of user.games) {
                    if (g && g.result === 'win' && g.reason === 'checkmate' && typeof g.movesCount === 'number' && g.movesCount > 0) {
                        if (!bestMate || g.movesCount < bestMate.movesCount) {
                            bestMate = {
                                movesCount: g.movesCount,
                                fullMoves: Math.ceil(g.movesCount / 2),
                                opponent: g.opponent || 'Соперник',
                                date: g.date || user.createdAt,
                                roomCode: g.roomCode || null,
                                gameId: g.id || null
                            };
                        }
                    }
                }
            }

            if (bestMate) {
                fastestMatesList.push({
                    username: user.username,
                    movesCount: bestMate.movesCount,
                    fullMoves: bestMate.fullMoves || Math.ceil(bestMate.movesCount / 2),
                    opponent: bestMate.opponent || 'Соперник',
                    date: bestMate.date,
                    roomCode: bestMate.roomCode || null
                });
            }
        }

        // Sort fastest mates: fewest movesCount first (ascending). Ties broken by earlier date.
        fastestMatesList.sort((a, b) => {
            if (a.movesCount !== b.movesCount) {
                return a.movesCount - b.movesCount;
            }
            return new Date(a.date).getTime() - new Date(b.date).getTime();
        });

        // Sort by most wins: highest wins first (descending), then winrate, then total games
        const mostWinsList = [...userStatsList].sort((a, b) => {
            if (b.wins !== a.wins) return b.wins - a.wins;
            if (b.winrate !== a.winrate) return b.winrate - a.winrate;
            return b.total - a.total;
        });

        // Sort by best winrate: players with >= 1 game, highest winrate first, then wins
        const bestWinrateList = userStatsList.filter(u => u.total > 0).sort((a, b) => {
            if (b.winrate !== a.winrate) return b.winrate - a.winrate;
            if (b.wins !== a.wins) return b.wins - a.wins;
            return b.total - a.total;
        });

        // Sort by most active: highest total games first
        const mostActiveList = [...userStatsList].sort((a, b) => {
            if (b.total !== a.total) return b.total - a.total;
            return b.wins - a.wins;
        });

        const assignRanks = (list) => {
            return list.slice(0, limit).map((item, idx) => ({
                rank: idx + 1,
                ...item
            }));
        };

        return {
            fastestMates: assignRanks(fastestMatesList),
            mostWins: assignRanks(mostWinsList),
            bestWinrate: assignRanks(bestWinrateList),
            mostActive: assignRanks(mostActiveList)
        };
    }

    getUserLeaderboardRank(username) {
        const key = this.normalizeUsername(username);
        const user = this.data.users[key];
        if (!user) return null;

        const boards = this.getLeaderboards(1000);
        const fastestIdx = boards.fastestMates.findIndex(item => item.username.toLowerCase() === key);
        const winsIdx = boards.mostWins.findIndex(item => item.username.toLowerCase() === key);
        const winrateIdx = boards.bestWinrate.findIndex(item => item.username.toLowerCase() === key);
        const activeIdx = boards.mostActive.findIndex(item => item.username.toLowerCase() === key);

        return {
            username: user.username,
            fastestMate: fastestIdx !== -1 ? boards.fastestMates[fastestIdx] : null,
            fastestMateRank: fastestIdx !== -1 ? fastestIdx + 1 : null,
            winsRank: winsIdx !== -1 ? winsIdx + 1 : null,
            winrateRank: winrateIdx !== -1 ? winrateIdx + 1 : null,
            activeRank: activeIdx !== -1 ? activeIdx + 1 : null,
            stats: user.stats || { wins: 0, losses: 0, draws: 0, total: 0 }
        };
    }
}

module.exports = {
    JsonDatabase,
    db: new JsonDatabase()
};
