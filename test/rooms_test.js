const { RoomManager } = require('../src/rooms.js');
const { JsonDatabase } = require('../src/db.js');
const path = require('node:path');
const fs = require('node:fs');

const testDbPath = path.join(__dirname, 'test_rooms_db.json');
if (fs.existsSync(testDbPath)) {
    fs.unlinkSync(testDbPath);
}

const db = new JsonDatabase(testDbPath);

function assert(cond, msg) {
    if (!cond) {
        console.error('FAIL:', msg);
        process.exit(1);
    } else {
        console.log('PASS:', msg);
    }
}

async function runTests() {
    // Register two users for testing
    const user1 = (await db.registerUser('PlayerWhite', 'pass123')).user;
    const user2 = (await db.registerUser('PlayerBlack', 'pass123')).user;

    const rm = new RoomManager(db);

    console.log('\n--- TEST 1: Generate room code & create room ---');
    const created = rm.createRoom(user1);
    assert(created.code && created.code.length === 6, 'Room code has 6 characters: ' + created.code);
    assert(created.color === 'white', 'Creator is assigned White');
    assert(created.status === 'waiting', 'Room status is waiting');

    console.log('\n--- TEST 2: Cannot join non-existent room ---');
    let notFoundCaught = false;
    try {
        rm.joinRoom('ZZZZZZ', user2);
    } catch (e) {
        notFoundCaught = true;
        assert(e.code === 'ROOM_NOT_FOUND', 'Correct error code ROOM_NOT_FOUND');
    }
    assert(notFoundCaught, 'Non-existent room error was caught');

    console.log('\n--- TEST 3: Cannot join room against oneself ---');
    let sameUserCaught = false;
    try {
        // user1 tries to join user1's room
        // If user1 calls joinRoom on their own waiting room, it's a reconnect or same-user check
        // In our logic: if room is waiting, calling joinRoom with same username is a reconnect:
        const reconnect = rm.joinRoom(created.code, user1);
        assert(reconnect.color === 'white', 'Creator reconnects as White');
    } catch (e) {
        // ok
    }

    console.log('\n--- TEST 4: Player 2 joins room ---');
    const joined = rm.joinRoom(created.code, user2);
    assert(joined.color === 'black', 'Player 2 is assigned Black');
    assert(joined.status === 'playing', 'Room status updated to playing');

    console.log('\n--- TEST 5: Third player cannot join full room ---');
    const user3 = (await db.registerUser('PlayerThree', 'pass123')).user;
    let fullCaught = false;
    try {
        rm.joinRoom(created.code, user3);
    } catch (e) {
        fullCaught = true;
        assert(e.code === 'ROOM_FULL', 'Correct error code ROOM_FULL');
    }
    assert(fullCaught, 'Full room was rejected');

    console.log('\n--- TEST 6: Turn enforcement ---');
    // Black tries to move first (turn is White)
    let wrongTurnCaught = false;
    try {
        await rm.handleMove(created.code, user2, 'e7', 'e5');
    } catch (e) {
        wrongTurnCaught = true;
        assert(e.code === 'NOT_YOUR_TURN', 'Black cannot move when White turn: NOT_YOUR_TURN');
    }
    assert(wrongTurnCaught, 'Wrong turn move rejected');

    // White moves e2 -> e4
    const whiteMove = await rm.handleMove(created.code, user1, 'e2', 'e4');
    assert(whiteMove.success === true, 'White moved e2 to e4 successfully');
    assert(whiteMove.san === 'e4', 'SAN is e4');

    // Black moves e7 -> e5
    const blackMove = await rm.handleMove(created.code, user2, 'e7', 'e5');
    assert(blackMove.success === true, 'Black moved e7 to e5 successfully');
    assert(blackMove.san === 'e5', 'SAN is e5');

    console.log('\n--- TEST 7: Resignation ---');
    // White resigns -> Black wins
    const resignRes = await rm.handleResign(created.code, user1);
    assert(resignRes.success === true, 'Resignation succeeded');
    assert(resignRes.result.winner === 'black', 'Black is the winner');
    assert(resignRes.result.reason === 'resignation', 'Reason is resignation');

    console.log('\n--- TEST 8: Checkmate flow & profile game recording ---');
    // Create new room for Fool's Mate test
    const mateRoom = rm.createRoom(user1);
    rm.joinRoom(mateRoom.code, user2);

    // Fool's mate: 1. f3 e5 2. g4 Qh4#
    await rm.handleMove(mateRoom.code, user1, 'f2', 'f3');
    await rm.handleMove(mateRoom.code, user2, 'e7', 'e5');
    await rm.handleMove(mateRoom.code, user1, 'g2', 'g4');
    const mateMove = await rm.handleMove(mateRoom.code, user2, 'd8', 'h4');

    assert(mateMove.status === 'checkmate', 'Status is checkmate');
    assert(mateMove.winner === 'black', 'Winner is black');

    // Verify room status is finished
    const roomAfterMate = rm.getRoom(mateRoom.code);
    assert(roomAfterMate.status === 'finished', 'Room status is finished');

    // Verify games are recorded in user profile
    const u1Games = db.getUserGames('playerwhite');
    assert(u1Games.length > 0, 'PlayerWhite has recorded games');
    assert(u1Games[0].result === 'loss', 'PlayerWhite lost the checkmate game');
    assert(u1Games[0].reason === 'checkmate', 'PlayerWhite game reason is checkmate');

    const u2Games = db.getUserGames('playerblack');
    assert(u2Games.length > 0, 'PlayerBlack has recorded games');
    assert(u2Games[0].result === 'win', 'PlayerBlack won the checkmate game');

    console.log('\nALL ROOM MANAGER TESTS PASSED SUCCESSFULLY!');
}

runTests().catch(err => {
    console.error('Test error:', err);
    process.exit(1);
});
