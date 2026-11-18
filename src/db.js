const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const DB_PATH = path.join(__dirname, '..', 'data', 'users_db.json');

class JsonDatabase {
    constructor(filePath = DB_PATH) {
        this.filePath = filePath;
        this.data = {
            users: {},
            sessions: {}
        };
        this.isWriting = false;
        this.writeQueue = [];
        this.load();
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

            if (whiteOutcome === 'win') whiteUser.stats.wins += 1;
            else if (whiteOutcome === 'loss') whiteUser.stats.losses += 1;
            else whiteUser.stats.draws += 1;
            whiteUser.stats.total += 1;
        }

        const blackUser = this.data.users[blackKey];
        if (blackUser) {
            if (!blackUser.games) blackUser.games = [];
            if (!blackUser.stats) blackUser.stats = { wins: 0, losses: 0, draws: 0, total: 0 };

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

            if (blackOutcome === 'win') blackUser.stats.wins += 1;
            else if (blackOutcome === 'loss') blackUser.stats.losses += 1;
            else blackUser.stats.draws += 1;
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

        if (outcome === 'win') user.stats.wins += 1;
        else if (outcome === 'loss') user.stats.losses += 1;
        else if (outcome === 'draw') user.stats.draws += 1;
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
}

module.exports = {
    JsonDatabase,
    db: new JsonDatabase()
};
