const assert = require('node:assert/strict');
const { createInitialState, makeMove, updateGameStatus, algebraicToCoords } = require('../js/engine.js');
const { chooseMove } = require('../js/bot.js');

function position(pieces, turn = 'white') {
    const state = createInitialState();
    state.board = Array.from({ length: 8 }, () => Array(8).fill(null));
    state.castlingRights = {
        white: { kingSide: false, queenSide: false },
        black: { kingSide: false, queenSide: false }
    };
    state.turn = turn;
    for (const [square, piece] of Object.entries(pieces)) {
        const { row, col } = algebraicToCoords(square);
        state.board[row][col] = piece;
    }
    updateGameStatus(state);
    return state;
}

function playBot(state, options = { timeLimitMs: 250, maxDepth: 2 }) {
    const snapshot = structuredClone(state);
    const result = chooseMove(state, options);
    assert.deepEqual(state, snapshot, 'Search must not change the live game, history, or castling rights');
    assert.ok(result.move, 'Bot returns a move in a playable position');
    const { from, to, promotionChoice } = result.move;
    assert.equal(makeMove(state, from, to, promotionChoice).success, true, 'Bot move obeys the existing rules');
    return result;
}

const initial = createInitialState();
const timed = playBot(initial, { timeLimitMs: 30 });
assert.ok(timed.elapsedMs < 1000, 'Search respects its time budget with room for slow CI');
assert.equal(initial.turn, 'black');
playBot(initial);
assert.equal(initial.turn, 'white', 'Bot can play either colour');

const blackMate = createInitialState();
for (const [from, to] of [['f2', 'f3'], ['e7', 'e5'], ['g2', 'g4']]) makeMove(blackMate, from, to);
playBot(blackMate);
assert.equal(blackMate.status, 'checkmate', 'Black finds mate in one');
assert.equal(blackMate.winner, 'black');
assert.equal(chooseMove(blackMate).move, null, 'Bot stops after checkmate');

const whiteMate = createInitialState();
for (const [from, to] of [
    ['e2', 'e4'], ['e7', 'e5'], ['f1', 'c4'], ['b8', 'c6'], ['d1', 'h5'], ['g8', 'f6']
]) makeMove(whiteMate, from, to);
playBot(whiteMate);
assert.equal(whiteMate.status, 'checkmate', 'White finds mate in one');
assert.equal(whiteMate.winner, 'white');

const freeQueen = position({ e1: 'wK', e8: 'bK', a1: 'wR', a8: 'bQ' });
playBot(freeQueen);
assert.equal(freeQueen.board[0][0], 'wR', 'Bot takes an undefended queen');

const poisonedPawn = position({ g1: 'wK', g8: 'bK', d1: 'wQ', d5: 'bP', d8: 'bR' });
playBot(poisonedPawn);
assert.notEqual(poisonedPawn.board[3][3], 'wQ', 'Bot avoids losing its queen for a defended pawn');

const inCheck = position({ e1: 'wK', a8: 'bK', e8: 'bR', a1: 'wR' });
assert.equal(inCheck.status, 'check');
playBot(inCheck);

const enPassant = position({ e1: 'wK', e8: 'bK', e5: 'wP', d5: 'bP' });
enPassant.enPassantTarget = algebraicToCoords('d6');
assert.equal(playBot(enPassant).move.to.isEnPassant, true, 'Bot understands an en passant capture');

const promotion = position({ h1: 'wK', h8: 'bK', a7: 'wP', b7: 'bR' });
playBot(promotion);
assert.equal(promotion.board[0][0], 'wQ', 'Bot promotes its pawn');

const underpromotion = position({ c6: 'wK', a7: 'bK', c7: 'wP' });
const promoted = playBot(underpromotion, { timeLimitMs: 250, maxDepth: 1 });
assert.equal(promoted.move.to.isPromotion, true);
assert.notEqual(promoted.move.promotionChoice, 'Q', 'Bot considers underpromotion to avoid stalemate');
assert.notEqual(underpromotion.status, 'stalemate', 'Bot avoids a stalemate on promotion');

const stalemate = position({ f7: 'wK', g6: 'wQ', h8: 'bK' }, 'black');
assert.equal(stalemate.status, 'stalemate');
assert.equal(chooseMove(stalemate).move, null, 'Bot stops after stalemate');

console.log('PASS: Bot legal moves, time budget, both colours, mates, tactics, checks, en passant, promotion, and terminal states');
