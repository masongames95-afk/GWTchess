const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { JsonDatabase } = require('../src/db.js');
const server = require('../server.js');

const testDbPath = path.join(__dirname, 'test_leaderboard_db.json');

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

async function runLeaderboardTests() {
    console.log('=== LEADERBOARD & RECORDS TESTS ===');

    console.log('\n--- TEST 1: Initial empty leaderboards ---');
    const emptyBoards = db.getLeaderboards();
    assert(Array.isArray(emptyBoards.fastestMates) && emptyBoards.fastestMates.length === 0, 'Fastest mates list is empty initially');
    assert(Array.isArray(emptyBoards.mostWins) && emptyBoards.mostWins.length === 0, 'Most wins list is empty initially');

    console.log('\n--- TEST 2: Register test accounts ---');
    await db.registerUser('Speedy', 'pass123');   // Will have 4 half-moves (2 full moves) mate
    await db.registerUser('Scholar', 'pass123');  // Will have 7 half-moves (4 full moves) mate
    await db.registerUser('Master', 'pass123');   // Will have 32 half-moves (16 full moves) mate, and 5 wins
    await db.registerUser('Resigner', 'pass123'); // Wins by resignation only (no checkmate)
    await db.registerUser('Casual', 'pass123');   // 0 games

    assert(db.userExists('Speedy'), 'Speedy exists');
    assert(db.userExists('Scholar'), 'Scholar exists');
    assert(db.userExists('Master'), 'Master exists');
    assert(db.userExists('Resigner'), 'Resigner exists');

    console.log('\n--- TEST 3: Record local and room games ---');
    // Speedy: 4 moves checkmate (Fool's Mate)
    await db.recordLocalGame('speedy', { outcome: 'win', reason: 'checkmate', movesCount: 4 });

    // Scholar: 7 moves checkmate (Scholar's Mate)
    await db.recordFinishedGame({
        whiteUsername: 'Scholar',
        blackUsername: 'Casual',
        winner: 'white',
        reason: 'checkmate',
        movesCount: 7,
        roomCode: 'SCH001'
    });

    // Master: 32 moves checkmate, plus 4 more wins (total 5 wins)
    await db.recordLocalGame('master', { outcome: 'win', reason: 'checkmate', movesCount: 32 });
    await db.recordLocalGame('master', { outcome: 'win', reason: 'resignation', movesCount: 20 });
    await db.recordLocalGame('master', { outcome: 'win', reason: 'resignation', movesCount: 15 });
    await db.recordLocalGame('master', { outcome: 'win', reason: 'resignation', movesCount: 18 });
    await db.recordLocalGame('master', { outcome: 'win', reason: 'resignation', movesCount: 25 });

    // Resigner: 2 wins by resignation
    await db.recordLocalGame('resigner', { outcome: 'win', reason: 'resignation', movesCount: 10 });
    await db.recordLocalGame('resigner', { outcome: 'win', reason: 'resignation', movesCount: 12 });

    console.log('\n--- TEST 4: Verify fastest checkmate leaderboard rankings ---');
    const boards = db.getLeaderboards();
    assert(boards.fastestMates.length === 3, 'Exactly 3 accounts have recorded checkmates');

    // Rank 1: Speedy (4 half-moves / 2 full moves)
    assert(boards.fastestMates[0].username === 'Speedy', 'Rank 1 is Speedy');
    assert(boards.fastestMates[0].movesCount === 4, 'Speedy movesCount is 4');
    assert(boards.fastestMates[0].fullMoves === 2, 'Speedy fullMoves is 2');
    assert(boards.fastestMates[0].rank === 1, 'Rank number is 1');

    // Rank 2: Scholar (7 half-moves / 4 full moves)
    assert(boards.fastestMates[1].username === 'Scholar', 'Rank 2 is Scholar');
    assert(boards.fastestMates[1].movesCount === 7, 'Scholar movesCount is 7');
    assert(boards.fastestMates[1].fullMoves === 4, 'Scholar fullMoves is 4');
    assert(boards.fastestMates[1].rank === 2, 'Rank number is 2');

    // Rank 3: Master (32 half-moves / 16 full moves)
    assert(boards.fastestMates[2].username === 'Master', 'Rank 3 is Master');
    assert(boards.fastestMates[2].movesCount === 32, 'Master movesCount is 32');
    assert(boards.fastestMates[2].fullMoves === 16, 'Master fullMoves is 16');
    assert(boards.fastestMates[2].rank === 3, 'Rank number is 3');

    // Verify Resigner (no checkmate) is NOT in fastestMates
    const hasResignerInMates = boards.fastestMates.some(e => e.username === 'Resigner');
    assert(!hasResignerInMates, 'Resigner is not in fastest mates leaderboard');

    console.log('\n--- TEST 5: Verify most wins leaderboard ---');
    assert(boards.mostWins[0].username === 'Master', 'Rank 1 most wins is Master');
    assert(boards.mostWins[0].wins === 5, 'Master has 5 wins');
    assert(boards.mostWins[1].username === 'Resigner', 'Rank 2 most wins is Resigner');
    assert(boards.mostWins[1].wins === 2, 'Resigner has 2 wins');

    console.log('\n--- TEST 6: User individual ranking lookup ---');
    const speedyRank = db.getUserLeaderboardRank('Speedy');
    assert(speedyRank.fastestMateRank === 1, 'Speedy fastest mate rank is 1');
    assert(speedyRank.fastestMate.movesCount === 4, 'Speedy record is 4 moves');

    const masterRank = db.getUserLeaderboardRank('Master');
    assert(masterRank.fastestMateRank === 3, 'Master fastest mate rank is 3');
    assert(masterRank.winsRank === 1, 'Master wins rank is 1');

    const resignerRank = db.getUserLeaderboardRank('Resigner');
    assert(resignerRank.fastestMateRank === null, 'Resigner has null fastest mate rank');
    assert(resignerRank.winsRank === 2, 'Resigner has wins rank 2');

    console.log('\n--- TEST 7: Updating personal best on new faster mate ---');
    // Master delivers a faster mate in 6 half-moves (3 full moves)!
    await db.recordLocalGame('master', { outcome: 'win', reason: 'checkmate', movesCount: 6 });
    const updatedBoards = db.getLeaderboards();
    // Speedy (4) < Master (6) < Scholar (7)
    assert(updatedBoards.fastestMates[0].username === 'Speedy', 'Rank 1 is still Speedy (4 moves)');
    assert(updatedBoards.fastestMates[1].username === 'Master', 'Rank 2 is now Master (6 moves)');
    assert(updatedBoards.fastestMates[1].movesCount === 6, 'Master updated movesCount is 6');
    assert(updatedBoards.fastestMates[2].username === 'Scholar', 'Rank 3 is now Scholar (7 moves)');

    // Cleanup test db
    if (fs.existsSync(testDbPath)) {
        fs.unlinkSync(testDbPath);
    }

    console.log('\n--- TEST 8: HTTP Integration Test (GET /api/leaderboard) ---');
    const TEST_PORT = 3097;
    const testServer = server.listen(TEST_PORT, async () => {
        try {
            const res = await request({
                host: 'localhost',
                port: TEST_PORT,
                path: '/api/leaderboard?limit=5',
                method: 'GET'
            });

            assert(res.statusCode === 200, 'HTTP status is 200');
            assert(res.body.success === true, 'Response success is true');
            assert(Boolean(res.body.leaderboards), 'Response contains leaderboards object');
            assert(Array.isArray(res.body.leaderboards.fastestMates), 'fastestMates is an array');
            assert(Array.isArray(res.body.leaderboards.mostWins), 'mostWins is an array');
            assert(Array.isArray(res.body.leaderboards.bestWinrate), 'bestWinrate is an array');
            assert(Array.isArray(res.body.leaderboards.mostActive), 'mostActive is an array');
            assert(res.body.userRank === null, 'Guest request userRank is null');

            console.log('\nALL LEADERBOARD TESTS PASSED SUCCESSFULLY!');
            testServer.close();
            process.exit(0);
        } catch (err) {
            console.error('HTTP test error:', err);
            testServer.close();
            process.exit(1);
        }
    });
}

runLeaderboardTests().catch(err => {
    console.error('Test failed with unhandled exception:', err);
    process.exit(1);
});
