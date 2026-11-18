const crypto = require('node:crypto');
const { createInitialState, makeMove } = require('../js/engine.js');
const { db } = require('./db.js');

const CODE_CHARS = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'; // 32 characters, no ambiguous chars (0, O, 1, I, L)

class RoomManager {
    constructor(dbInstance = db) {
        this.db = dbInstance;
        this.rooms = new Map(); // code -> room
        // Cleanup interval for old rooms (every 30 mins)
        this.cleanupTimer = setInterval(() => this.cleanupOldRooms(), 30 * 60 * 1000);
        if (this.cleanupTimer.unref) this.cleanupTimer.unref();
    }

    generateCode() {
        let code = '';
        const bytes = crypto.randomBytes(6);
        for (let i = 0; i < 6; i++) {
            code += CODE_CHARS[bytes[i] % CODE_CHARS.length];
        }
        // Ensure uniqueness
        if (this.rooms.has(code)) {
            return this.generateCode();
        }
        return code;
    }

    createRoom(user) {
        if (!user || !user.username) {
            throw new Error('Для создания комнаты необходимо войти в аккаунт.');
        }

        const code = this.generateCode();
        const room = {
            code,
            createdAt: Date.now(),
            status: 'waiting', // 'waiting' | 'playing' | 'finished'
            creator: user.username,
            white: { username: user.username, connected: true },
            black: null,
            gameState: createInitialState(),
            result: null, // { winner: 'white'|'black'|'draw', reason: 'checkmate'|'stalemate'|'resignation' }
            sseClients: new Set()
        };

        this.rooms.set(code, room);

        return {
            code,
            color: 'white',
            status: 'waiting',
            room: this.getPublicRoom(room, user)
        };
    }

    joinRoom(rawCode, user) {
        if (!user || !user.username) {
            throw new Error('Для присоединения к игре необходимо войти в аккаунт.');
        }

        const code = (rawCode || '').trim().toUpperCase();
        const room = this.rooms.get(code);

        if (!room) {
            const err = new Error(`Комната "${code}" не найдена. Проверьте код и попробуйте снова.`);
            err.code = 'ROOM_NOT_FOUND';
            throw err;
        }

        const usernameLower = user.username.toLowerCase();
        const whiteLower = room.white ? room.white.username.toLowerCase() : '';
        const blackLower = room.black ? room.black.username.toLowerCase() : '';

        // Case 1: Reconnecting as White
        if (whiteLower === usernameLower) {
            room.white.connected = true;
            return {
                code,
                color: 'white',
                status: room.status,
                room: this.getPublicRoom(room, user)
            };
        }

        // Case 2: Reconnecting as Black
        if (blackLower === usernameLower) {
            room.black.connected = true;
            return {
                code,
                color: 'black',
                status: room.status,
                room: this.getPublicRoom(room, user)
            };
        }

        // Case 3: Finished room
        if (room.status === 'finished') {
            const err = new Error(`Партия в комнате "${code}" уже завершена.`);
            err.code = 'ROOM_FINISHED';
            throw err;
        }

        // Case 4: Cannot play against oneself
        if (whiteLower === usernameLower) {
            const err = new Error('Нельзя играть против самого себя. Передайте код комнаты другому игроку.');
            err.code = 'SAME_USER';
            throw err;
        }

        // Case 5: Room is waiting for opponent
        if (room.status === 'waiting') {
            room.black = { username: user.username, connected: true };
            room.status = 'playing';

            // Broadcast match start to all connected clients (creator waiting)
            this.broadcast(room, {
                type: 'room_start',
                code: room.code,
                status: 'playing',
                white: room.white.username,
                black: room.black.username,
                gameState: room.gameState
            });

            return {
                code,
                color: 'black',
                status: 'playing',
                room: this.getPublicRoom(room, user)
            };
        }

        // Case 6: Room already has two different players
        const err = new Error(`В комнате "${code}" уже играют два участника.`);
        err.code = 'ROOM_FULL';
        throw err;
    }

    getRoom(rawCode) {
        const code = (rawCode || '').trim().toUpperCase();
        return this.rooms.get(code) || null;
    }

    getPublicRoom(room, currentUser = null) {
        if (!room) return null;
        let myColor = null;
        if (currentUser && currentUser.username) {
            const uname = currentUser.username.toLowerCase();
            if (room.white && room.white.username.toLowerCase() === uname) {
                myColor = 'white';
            } else if (room.black && room.black.username.toLowerCase() === uname) {
                myColor = 'black';
            }
        }

        return {
            code: room.code,
            status: room.status,
            creator: room.creator,
            white: room.white ? room.white.username : null,
            black: room.black ? room.black.username : null,
            turn: room.gameState.turn,
            moveCount: room.gameState.moveCount,
            gameState: room.gameState,
            result: room.result,
            myColor
        };
    }

    async handleMove(rawCode, user, from, to, promotionChoice = 'Q') {
        const code = (rawCode || '').trim().toUpperCase();
        const room = this.rooms.get(code);

        if (!room) {
            const err = new Error(`Комната "${code}" не найдена.`);
            err.code = 'ROOM_NOT_FOUND';
            throw err;
        }

        if (room.status !== 'playing') {
            const err = new Error('Партия в этой комнате не активна.');
            err.code = 'ROOM_NOT_PLAYING';
            throw err;
        }

        const usernameLower = user.username.toLowerCase();
        const whiteLower = room.white ? room.white.username.toLowerCase() : '';
        const blackLower = room.black ? room.black.username.toLowerCase() : '';

        let playerColor = null;
        if (usernameLower === whiteLower) playerColor = 'white';
        else if (usernameLower === blackLower) playerColor = 'black';
        else {
            const err = new Error('Вы не являетесь участником этой онлайн-партии.');
            err.code = 'NOT_PARTICIPANT';
            throw err;
        }

        if (room.gameState.turn !== playerColor) {
            const err = new Error(`Сейчас ход ${room.gameState.turn === 'white' ? 'белых' : 'черных'}! Дождитесь хода соперника.`);
            err.code = 'NOT_YOUR_TURN';
            throw err;
        }

        // Validate and apply move through the engine
        const moveResult = makeMove(room.gameState, from, to, promotionChoice);

        if (!moveResult.success) {
            const err = new Error(moveResult.error || 'Недопустимый ход шахматными правилами.');
            err.code = 'ILLEGAL_MOVE';
            throw err;
        }

        // Check for game completion
        if (moveResult.status === 'checkmate' || moveResult.status === 'stalemate') {
            room.status = 'finished';
            room.result = {
                winner: moveResult.winner,
                reason: moveResult.status
            };

            // Record game in database for both players!
            try {
                await this.db.recordFinishedGame({
                    whiteUsername: room.white.username,
                    blackUsername: room.black.username,
                    winner: moveResult.winner,
                    reason: moveResult.status,
                    movesCount: room.gameState.moveCount,
                    roomCode: room.code
                });
            } catch (saveErr) {
                console.error('[ROOMS] Failed to save finished game to DB:', saveErr);
            }
        }

        // Broadcast move to all SSE clients in the room
        this.broadcast(room, {
            type: 'move',
            from,
            to,
            promotionChoice,
            san: moveResult.san,
            status: moveResult.status,
            winner: moveResult.winner,
            gameState: room.gameState,
            result: room.result
        });

        return {
            success: true,
            san: moveResult.san,
            status: moveResult.status,
            winner: moveResult.winner,
            gameState: room.gameState,
            result: room.result
        };
    }

    async handleResign(rawCode, user) {
        const code = (rawCode || '').trim().toUpperCase();
        const room = this.rooms.get(code);

        if (!room) {
            const err = new Error(`Комната "${code}" не найдена.`);
            err.code = 'ROOM_NOT_FOUND';
            throw err;
        }

        if (room.status !== 'playing') {
            const err = new Error('Партия не активна.');
            err.code = 'ROOM_NOT_PLAYING';
            throw err;
        }

        const usernameLower = user.username.toLowerCase();
        const whiteLower = room.white ? room.white.username.toLowerCase() : '';
        const blackLower = room.black ? room.black.username.toLowerCase() : '';

        let resignedColor = null;
        let winnerColor = null;

        if (usernameLower === whiteLower) {
            resignedColor = 'white';
            winnerColor = 'black';
        } else if (usernameLower === blackLower) {
            resignedColor = 'black';
            winnerColor = 'white';
        } else {
            const err = new Error('Вы не являетесь участником этой партии.');
            err.code = 'NOT_PARTICIPANT';
            throw err;
        }

        room.status = 'finished';
        room.result = {
            winner: winnerColor,
            reason: 'resignation',
            resignedBy: user.username,
            resignedColor
        };

        // Record game in database for both players!
        try {
            await this.db.recordFinishedGame({
                whiteUsername: room.white.username,
                blackUsername: room.black.username,
                winner: winnerColor,
                reason: 'resignation',
                movesCount: room.gameState.moveCount,
                roomCode: room.code
            });
        } catch (saveErr) {
            console.error('[ROOMS] Failed to save resigned game to DB:', saveErr);
        }

        this.broadcast(room, {
            type: 'game_over',
            winner: winnerColor,
            reason: 'resignation',
            resignedBy: user.username,
            gameState: room.gameState,
            result: room.result
        });

        return {
            success: true,
            result: room.result
        };
    }

    addSSEClient(rawCode, res, user) {
        const code = (rawCode || '').trim().toUpperCase();
        const room = this.rooms.get(code);

        if (!room) {
            res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
            res.end(`Комната ${code} не найдена.`);
            return;
        }

        // Establish SSE stream
        res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
            'Access-Control-Allow-Origin': '*'
        });

        room.sseClients.add(res);

        // Send initial state sync event
        const initData = {
            type: 'sync',
            room: this.getPublicRoom(room, user)
        };
        res.write(`data: ${JSON.stringify(initData)}\n\n`);

        // Ping heartbeat every 20 seconds
        const heartbeatTimer = setInterval(() => {
            try {
                res.write(': ping\n\n');
            } catch (e) {
                clearInterval(heartbeatTimer);
            }
        }, 20000);

        reqCleanup: {
            const cleanup = () => {
                clearInterval(heartbeatTimer);
                room.sseClients.delete(res);
            };
            res.on('close', cleanup);
            res.on('finish', cleanup);
            res.on('error', cleanup);
        }
    }

    broadcast(room, data) {
        if (!room || !room.sseClients) return;
        const payload = `data: ${JSON.stringify(data)}\n\n`;
        for (const clientRes of room.sseClients) {
            try {
                clientRes.write(payload);
            } catch (err) {
                room.sseClients.delete(clientRes);
            }
        }
    }

    cleanupOldRooms() {
        const maxAge = 4 * 60 * 60 * 1000; // 4 hours
        const now = Date.now();
        for (const [code, room] of this.rooms.entries()) {
            if (now - room.createdAt > maxAge && room.sseClients.size === 0) {
                this.rooms.delete(code);
            }
        }
    }
}

module.exports = {
    RoomManager,
    rooms: new RoomManager()
};
