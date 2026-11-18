const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const server = require('../server.js');

const PORT = 3099;
process.env.PORT = PORT;

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
    console.log(`Test server running on port ${PORT}...`);

    try {
        console.log('\n--- ROUTE 1: Check username that does not exist ---');
        let res = await request({
            host: 'localhost',
            port: PORT,
            path: '/api/auth/check-username?username=chessmaster',
            method: 'GET'
        });
        assert(res.statusCode === 200, 'Status is 200');
        assert(res.body.exists === false, 'Username does not exist');
        assert(res.body.valid === true, 'Username format is valid');

        console.log('\n--- ROUTE 2: Register user chessmaster ---');
        res = await request({
            host: 'localhost',
            port: PORT,
            path: '/api/auth/register',
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        }, { username: 'chessmaster', password: 'password123' });

        assert(res.statusCode === 201, 'Status is 201 Created');
        assert(res.body.success === true, 'Registration success');
        assert(res.body.user.username === 'chessmaster', 'Username returned');
        assert(Boolean(res.headers['set-cookie']), 'Set-Cookie header sent');
        const cookie = res.headers['set-cookie'][0].split(';')[0];

        console.log('\n--- ROUTE 3: Check username that NOW exists ---');
        res = await request({
            host: 'localhost',
            port: PORT,
            path: '/api/auth/check-username?username=chessmaster',
            method: 'GET'
        });
        assert(res.statusCode === 200, 'Status is 200');
        assert(res.body.exists === true, 'Username exists now');

        console.log('\n--- ROUTE 4: Duplicate registration attempt ---');
        res = await request({
            host: 'localhost',
            port: PORT,
            path: '/api/auth/register',
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        }, { username: 'chessmaster', password: 'password123' });
        assert(res.statusCode === 409, 'Duplicate returns 409 Conflict');
        assert(res.body.success === false, 'Duplicate rejected');

        console.log('\n--- ROUTE 5: Login with non-existent user ---');
        res = await request({
            host: 'localhost',
            port: PORT,
            path: '/api/auth/login',
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        }, { username: 'unknown_player', password: 'password123' });
        assert(res.statusCode === 404, 'Returns 404 for non-existent user');
        assert(res.body.code === 'USER_NOT_FOUND', 'User not found error code returned');

        console.log('\n--- ROUTE 6: Login with wrong password ---');
        res = await request({
            host: 'localhost',
            port: PORT,
            path: '/api/auth/login',
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        }, { username: 'chessmaster', password: 'wrongpassword' });
        assert(res.statusCode === 401, 'Returns 401 for wrong password');
        assert(res.body.code === 'INVALID_PASSWORD', 'Invalid password error code returned');

        console.log('\n--- ROUTE 7: Login with correct password ---');
        res = await request({
            host: 'localhost',
            port: PORT,
            path: '/api/auth/login',
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        }, { username: 'chessmaster', password: 'password123' });
        assert(res.statusCode === 200, 'Returns 200 on login');
        assert(res.body.success === true, 'Login successful');

        console.log('\n--- ROUTE 8: Verify current session via cookie ---');
        res = await request({
            host: 'localhost',
            port: PORT,
            path: '/api/auth/me',
            method: 'GET',
            headers: { 'Cookie': cookie }
        });
        assert(res.statusCode === 200, 'Status is 200');
        assert(res.body.authenticated === true, 'Authenticated is true');
        assert(res.body.user.username === 'chessmaster', 'User is chessmaster');

        console.log('\n--- ROUTE 9: Save game and stats via API ---');
        res = await request({
            host: 'localhost',
            port: PORT,
            path: '/api/user/save-game',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Cookie': cookie
            }
        }, { gameState: { turn: 'black', moveCount: 3 } });
        assert(res.statusCode === 200, 'Game saved successfully');

        res = await request({
            host: 'localhost',
            port: PORT,
            path: '/api/user/record-result',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Cookie': cookie
            }
        }, { outcome: 'win' });
        assert(res.statusCode === 200, 'Result recorded');
        assert(res.body.stats.wins === 1, 'Wins incremented');

        console.log('\n--- ROUTE 10: Logout ---');
        res = await request({
            host: 'localhost',
            port: PORT,
            path: '/api/auth/logout',
            method: 'POST',
            headers: { 'Cookie': cookie }
        });
        assert(res.statusCode === 200, 'Logged out');

        res = await request({
            host: 'localhost',
            port: PORT,
            path: '/api/auth/me',
            method: 'GET',
            headers: { 'Cookie': cookie }
        });
        assert(res.body.authenticated === false, 'Session is now invalid');

        console.log('\nALL SERVER HTTP TESTS PASSED SUCCESSFULLY!');
        process.exit(0);
    } catch (err) {
        console.error('Test failed:', err);
        process.exit(1);
    }
});
