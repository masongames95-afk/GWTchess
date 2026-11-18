const fs = require('node:fs');
const path = require('node:path');
const { JsonDatabase } = require('../src/db.js');

const testDbPath = path.join(__dirname, 'test_users_db.json');

// Cleanup previous test db if present
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
    console.log('--- TEST 1: Check non-existent user ---');
    assert(db.userExists('alice') === false, 'User alice does not exist initially');

    console.log('\n--- TEST 2: Register user ---');
    const regResult = await db.registerUser('Alice', 'secret123');
    assert(regResult.user.username === 'Alice', 'Registered username is Alice');
    assert(regResult.token && typeof regResult.token === 'string', 'Token issued');
    assert(db.userExists('alice') === true, 'userExists case-insensitive is true for alice');
    assert(db.userExists('Alice') === true, 'userExists case-insensitive is true for Alice');

    // Verify password is not saved in plaintext
    const rawData = JSON.parse(fs.readFileSync(testDbPath, 'utf8'));
    assert(rawData.users.alice.passwordHash !== 'secret123', 'Password is not plaintext');
    assert(Boolean(rawData.users.alice.salt), 'Salt is generated');

    console.log('\n--- TEST 3: Duplicate user registration rejection ---');
    let duplicateRejected = false;
    try {
        await db.registerUser('alice', 'different456');
    } catch (e) {
        duplicateRejected = true;
        assert(e.message.includes('уже существует'), 'Correct error message for duplicate user');
    }
    assert(duplicateRejected, 'Duplicate registration was rejected');

    console.log('\n--- TEST 4: Login with non-existent user ---');
    let nonExistentRejected = false;
    try {
        await db.authenticateUser('bob', 'secret123');
    } catch (e) {
        nonExistentRejected = true;
        assert(e.code === 'USER_NOT_FOUND', 'Correct error code USER_NOT_FOUND');
    }
    assert(nonExistentRejected, 'Non-existent user authentication rejected');

    console.log('\n--- TEST 5: Login with wrong password ---');
    let wrongPasswordRejected = false;
    try {
        await db.authenticateUser('alice', 'wrongpass');
    } catch (e) {
        wrongPasswordRejected = true;
        assert(e.code === 'INVALID_PASSWORD', 'Correct error code INVALID_PASSWORD');
    }
    assert(wrongPasswordRejected, 'Wrong password rejected');

    console.log('\n--- TEST 6: Login with correct password ---');
    const loginResult = await db.authenticateUser('Alice', 'secret123');
    assert(loginResult.user.username === 'Alice', 'Logged in as Alice');
    assert(loginResult.token.length > 0, 'New session token generated');

    console.log('\n--- TEST 7: Session lookup ---');
    const sessionUser = db.getUserBySession(loginResult.token);
    assert(sessionUser !== null, 'Session user found');
    assert(sessionUser.username === 'Alice', 'Session user username matches');

    console.log('\n--- TEST 8: Save game to DB ---');
    const dummyGame = { turn: 'black', moveCount: 5 };
    await db.saveUserGame('alice', dummyGame);
    const updatedUser = db.getUserBySession(loginResult.token);
    assert(updatedUser.savedGame.state.moveCount === 5, 'Saved game state retrieved');

    console.log('\n--- TEST 9: Update stats ---');
    await db.recordGameResult('alice', 'win');
    await db.recordGameResult('alice', 'draw');
    const userWithStats = db.getUserBySession(loginResult.token);
    assert(userWithStats.stats.wins === 1, 'Wins count updated');
    assert(userWithStats.stats.draws === 1, 'Draws count updated');
    assert(userWithStats.stats.total === 2, 'Total games count updated');

    console.log('\n--- TEST 10: Logout (delete session) ---');
    await db.deleteSession(loginResult.token);
    const loggedOutUser = db.getUserBySession(loginResult.token);
    assert(loggedOutUser === null, 'Session successfully invalidated');

    // Cleanup test db
    if (fs.existsSync(testDbPath)) {
        fs.unlinkSync(testDbPath);
    }

    console.log('\nALL DATABASE TESTS PASSED SUCCESSFULLY!');
}

runTests().catch(err => {
    console.error('Test error:', err);
    process.exit(1);
});
