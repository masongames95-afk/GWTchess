const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { JsonDatabase } = require('../src/db.js');
const { RoomManager } = require('../src/rooms.js');

async function runTests() {
    const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'chess-rooms-'));
    const testDbPath = path.join(testDir, 'users.json');
    const managers = [];
    const restart = () => {
        const db = new JsonDatabase(testDbPath);
        const rooms = new RoomManager(db);
        managers.push(rooms);
        return { db, rooms };
    };

    try {
        let { db, rooms } = restart();
        const white = (await db.registerUser('PersistentWhite', 'password123')).user;
        const black = (await db.registerUser('PersistentBlack', 'password123')).user;
        const created = await rooms.createRoom(white);

        ({ db, rooms } = restart());
        const joined = await rooms.joinRoom(created.code.toLowerCase(), black);
        assert.equal(joined.status, 'playing');
        assert.equal(joined.color, 'black');
        console.log('PASS: Waiting room survives a server restart and accepts an opponent');

        ({ db, rooms } = restart());
        const firstMove = await rooms.handleMove(created.code, white, 'e2', 'e4');
        assert.equal(firstMove.success, true);
        assert.equal(firstMove.san, 'e4');
        console.log('PASS: First move succeeds after restarting an active room');

        ({ db, rooms } = restart());
        const restored = await rooms.getRoom(created.code);
        assert.equal(restored.gameState.board[4][4], 'wP');
        assert.equal(restored.gameState.turn, 'black');
        assert.equal(restored.sseClients.size, 0);
        const reply = await rooms.handleMove(created.code, black, 'e7', 'e5');
        assert.equal(reply.san, 'e5');
        console.log('PASS: Board position and turn survive a restart');

        await rooms.handleResign(created.code, black);
        ({ db, rooms } = restart());
        assert.equal(await rooms.getRoom(created.code), null);
        assert.equal(db.getUserGames('persistentwhite')[0].result, 'win');
        assert.equal(db.getUserGames('persistentblack')[0].result, 'loss');
        console.log('PASS: Resignation deletes the room and preserves both players\' history');

        const mateRoom = await rooms.createRoom(white);
        await rooms.joinRoom(mateRoom.code, black);
        await rooms.handleMove(mateRoom.code, white, 'f2', 'f3');
        await rooms.handleMove(mateRoom.code, black, 'e7', 'e5');
        await rooms.handleMove(mateRoom.code, white, 'g2', 'g4');
        ({ db, rooms } = restart());
        const mate = await rooms.handleMove(mateRoom.code, black, 'd8', 'h4');
        assert.equal(mate.status, 'checkmate');
        ({ db, rooms } = restart());
        assert.equal(await rooms.getRoom(mateRoom.code), null);
        assert.equal(db.getUserGames('persistentblack')[0].reason, 'checkmate');
        console.log('PASS: Checkmate deletes the room and preserves the result');

        const drawn = await rooms.createRoom(white);
        await rooms.joinRoom(drawn.code, black);
        const drawnRoom = await rooms.getRoom(drawn.code);
        drawnRoom.gameState.board = Array.from({ length: 8 }, () => Array(8).fill(null));
        drawnRoom.gameState.board[0][0] = 'bK';
        drawnRoom.gameState.board[2][2] = 'wK';
        drawnRoom.gameState.board[3][1] = 'wQ';
        await db.saveRoom(drawnRoom);
        ({ db, rooms } = restart());
        const stalemate = await rooms.handleMove(drawn.code, white, 'b5', 'b6');
        assert.equal(stalemate.status, 'stalemate');
        ({ db, rooms } = restart());
        assert.equal(await rooms.getRoom(drawn.code), null);
        assert.equal(db.getUserGames('persistentwhite')[0].result, 'draw');
        assert.equal(db.getUserGames('persistentblack')[0].result, 'draw');
        console.log('PASS: Stalemate deletes the room and preserves both players\' draws');

        const abandoned = await rooms.createRoom(white);
        const abandonedRoom = await rooms.getRoom(abandoned.code);
        abandonedRoom.updatedAt = Date.now() - 5 * 60 * 60 * 1000;
        await db.saveRoom(abandonedRoom);
        const live = await rooms.createRoom(black);
        ({ db, rooms } = restart());
        await rooms.cleanupOldRooms();
        assert.equal(await rooms.getRoom(abandoned.code), null);
        assert.ok(await rooms.getRoom(live.code));
        ({ db, rooms } = restart());
        assert.equal(await rooms.getRoom(abandoned.code), null);
        assert.ok(await rooms.getRoom(live.code));
        console.log('PASS: Expired abandoned rooms are removed while recent rooms remain');

        const connected = await rooms.getRoom(live.code);
        connected.updatedAt = Date.now() - 5 * 60 * 60 * 1000;
        connected.sseClients.add({});
        await db.saveRoom(connected);
        await rooms.cleanupOldRooms();
        assert.ok(await db.loadRoom(live.code));
        connected.sseClients.clear();
        await rooms.cleanupOldRooms();
        assert.equal(await db.loadRoom(live.code), null);
        console.log('PASS: Cleanup protects rooms with connected players');

        console.log('\nALL ROOM PERSISTENCE TESTS PASSED SUCCESSFULLY!');
    } finally {
        for (const manager of managers) clearInterval(manager.cleanupTimer);
        fs.rmSync(testDir, { recursive: true, force: true });
    }
}

runTests().catch(err => {
    console.error(err);
    process.exitCode = 1;
});
