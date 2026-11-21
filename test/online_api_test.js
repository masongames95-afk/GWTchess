const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { db } = require('../src/db.js');
const { rooms } = require('../src/rooms.js');
const server = require('../server.js');

const PORT = 3098;

function assert(cond, msg) {
    if (!cond) {
        console.error('FAIL:', msg);
        process.exit(1);
    } else {
        console.log('PASS:', msg);
    }
}

function request(options, postData = null) {
    return new Promise((resolve, reject) => {
        const req = http.request(options, (res) => {
            let data = '';
            res.on('data', chunk => { data += chunk; });
            res.on('end', () => {
                let parsed = null;
                try {
                    parsed = JSON.parse(data);
                } catch (e) {
                    parsed = data;
                }
                resolve({
                    statusCode: res.statusCode,
                    headers: res.headers,
                    body: parsed
                });
            });
        });

        req.on('error', reject);

        if (postData) {
            req.write(typeof postData === 'string' ? postData : JSON.stringify(postData));
        }
        req.end();
    });
}

server.listen(PORT, async () => {
    console.log(`Online API Test server running on port ${PORT}...`);

    // Isolate DB to temporary test file during tests
    const originalDbPath = db.filePath;
    const originalData = JSON.parse(JSON.stringify(db.data));
    const testDbPath = path.join(__dirname, 'test_online_api_db.json');

    function cleanup() {
        db.filePath = originalDbPath;
        db.data = originalData;
        db.saveSync();
        if (fs.existsSync(testDbPath)) {
            try { fs.unlinkSync(testDbPath); } catch (e) {}
        }
    }

    try {
        db.filePath = testDbPath;
        db.data = { users: {}, sessions: {} };
        db.saveSync();

        // 1. Register User 1 and User 2
        console.log('\n--- STEP 1: Register two users ---');
        let res = await request({
            host: 'localhost',
            port: PORT,
            path: '/api/auth/register',
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        }, { username: 'GrandMaster1', password: 'password123' });
        assert(res.statusCode === 201, 'GrandMaster1 registered');
        const token1 = res.body.token;

        res = await request({
            host: 'localhost',
            port: PORT,
            path: '/api/auth/register',
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        }, { username: 'Challenger2', password: 'password123' });
        assert(res.statusCode === 201, 'Challenger2 registered');
        const token2 = res.body.token;

        // 2. Unauthenticated room creation
        console.log('\n--- STEP 2: Create room unauthenticated ---');
        res = await request({
            host: 'localhost',
            port: PORT,
            path: '/api/rooms/create',
            method: 'POST'
        });
        assert(res.statusCode === 401, 'Unauthenticated room create rejected with 401');

        // 3. User 1 creates room
        console.log('\n--- STEP 3: GrandMaster1 creates online room ---');
        res = await request({
            host: 'localhost',
            port: PORT,
            path: '/api/rooms/create',
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token1}` }
        });
        assert(res.statusCode === 201, 'Room created with 201');
        assert(res.body.success === true, 'Success is true');
        const roomCode = res.body.room.code;
        assert(roomCode && roomCode.length === 6, 'Generated room code is 6 chars: ' + roomCode);
        assert(res.body.room.color === 'white', 'Creator plays White');

        // 4. Challenger2 joins room by code
        console.log('\n--- STEP 4: Challenger2 joins room ---');
        res = await request({
            host: 'localhost',
            port: PORT,
            path: '/api/rooms/join',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token2}`
            }
        }, { code: roomCode });
        assert(res.statusCode === 200, 'Challenger2 joined successfully');
        assert(res.body.color === 'black', 'Challenger2 plays Black');
        assert(res.body.status === 'playing', 'Room status changed to playing');

        // 5. Get room state
        console.log('\n--- STEP 5: Inspect room state ---');
        res = await request({
            host: 'localhost',
            port: PORT,
            path: `/api/rooms/${roomCode}`,
            method: 'GET',
            headers: { 'Authorization': `Bearer ${token1}` }
        });
        assert(res.statusCode === 200, 'Room state fetched');
        assert(res.body.room.white === 'GrandMaster1', 'White is GrandMaster1');
        assert(res.body.room.black === 'Challenger2', 'Black is Challenger2');
        assert(res.body.room.myColor === 'white', 'myColor correctly resolved to white');

        // 6. Challenger2 tries to move out of turn
        console.log('\n--- STEP 6: Turn enforcement via API ---');
        res = await request({
            host: 'localhost',
            port: PORT,
            path: `/api/rooms/${roomCode}/move`,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token2}`
            }
        }, { from: 'e7', to: 'e5' });
        assert(res.statusCode === 400, 'Challenger2 out of turn move rejected');
        assert(res.body.code === 'NOT_YOUR_TURN', 'Error code is NOT_YOUR_TURN');

        // 7. GrandMaster1 moves e2 -> e4
        console.log('\n--- STEP 7: GrandMaster1 moves e2-e4 ---');
        rooms.rooms.clear(); // Simulate server memory loss before the first move
        res = await request({
            host: 'localhost',
            port: PORT,
            path: `/api/rooms/${roomCode}/move`,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token1}`
            }
        }, { from: 'e2', to: 'e4' });
        assert(res.statusCode === 200, 'Move e2-e4 accepted');
        assert(res.body.san === 'e4', 'SAN notation is e4');

        // 8. Challenger2 resigns
        console.log('\n--- STEP 8: Challenger2 resigns ---');
        res = await request({
            host: 'localhost',
            port: PORT,
            path: `/api/rooms/${roomCode}/resign`,
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token2}` }
        });
        assert(res.statusCode === 200, 'Resign request succeeded');
        assert(res.body.result.winner === 'white', 'Winner is white');
        assert(res.body.result.reason === 'resignation', 'Reason is resignation');
        res = await request({
            host: 'localhost',
            port: PORT,
            path: `/api/rooms/${roomCode}`,
            method: 'GET'
        });
        assert(res.statusCode === 404, 'Finished room was deleted');

        // 9. Check GrandMaster1 game history in profile
        console.log('\n--- STEP 9: Verify profile games history for winner ---');
        res = await request({
            host: 'localhost',
            port: PORT,
            path: '/api/user/games',
            method: 'GET',
            headers: { 'Authorization': `Bearer ${token1}` }
        });
        assert(res.statusCode === 200, 'Games fetched for GrandMaster1');
        assert(res.body.games.length === 1, '1 game in profile history');
        assert(res.body.games[0].result === 'win', 'Game outcome is win');
        assert(res.body.games[0].opponent === 'Challenger2', 'Opponent recorded as Challenger2');
        assert(res.body.games[0].roomCode === roomCode, 'Room code saved in profile record');
        assert(res.body.stats.wins === 1, 'Profile wins counter is 1');

        // 10. Check Challenger2 game history in profile
        console.log('\n--- STEP 10: Verify profile games history for loser ---');
        res = await request({
            host: 'localhost',
            port: PORT,
            path: '/api/user/games',
            method: 'GET',
            headers: { 'Authorization': `Bearer ${token2}` }
        });
        assert(res.statusCode === 200, 'Games fetched for Challenger2');
        assert(res.body.games.length === 1, '1 game in profile history');
        assert(res.body.games[0].result === 'loss', 'Game outcome is loss');
        assert(res.body.games[0].opponent === 'GrandMaster1', 'Opponent recorded as GrandMaster1');
        assert(res.body.stats.losses === 1, 'Profile losses counter is 1');

        // 11. Record local game into profile
        console.log('\n--- STEP 11: Record local game into profile ---');
        res = await request({
            host: 'localhost',
            port: PORT,
            path: '/api/user/record-game',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token1}`
            }
        }, { outcome: 'win', reason: 'checkmate', movesCount: 32 });
        assert(res.statusCode === 200, 'Local game recorded');
        assert(res.body.stats.wins === 2, 'Total wins now 2');
        assert(res.body.games.length === 2, 'Total games in profile now 2');

        console.log('\nALL ONLINE API TESTS PASSED SUCCESSFULLY!');
        cleanup();
        process.exit(0);
    } catch (err) {
        console.error('Test failed with error:', err);
        cleanup();
        process.exit(1);
    }
});
