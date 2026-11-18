// Test suite for chess engine logic
const {
    createInitialState,
    getLegalMovesForSquare,
    getAllLegalMoves,
    makeMove,
    isKingInCheck,
    coordsToAlgebraic,
    algebraicToCoords
} = require('../js/engine.js');

function assert(condition, message) {
    if (!condition) {
        console.error('FAIL:', message);
        process.exit(1);
    } else {
        console.log('PASS:', message);
    }
}

console.log('--- TEST 1: Initial state & legal moves ---');
let state = createInitialState();
assert(state.turn === 'white', 'Initial turn is white');
assert(state.status === 'active', 'Initial status is active');

// e2 pawn should have 2 moves: e3 and e4
const e2Coords = algebraicToCoords('e2');
const e2Moves = getLegalMovesForSquare(state, e2Coords.row, e2Coords.col);
assert(e2Moves.length === 2, 'e2 pawn has 2 moves');
assert(e2Moves.some(m => coordsToAlgebraic(m.row, m.col) === 'e3'), 'e2 can move to e3');
assert(e2Moves.some(m => coordsToAlgebraic(m.row, m.col) === 'e4'), 'e2 can move to e4');

// King at e1 should have 0 moves initially (blocked by pawns & pieces)
const e1Coords = algebraicToCoords('e1');
const e1Moves = getLegalMovesForSquare(state, e1Coords.row, e1Coords.col);
assert(e1Moves.length === 0, 'e1 king has 0 moves at start');

console.log('\n--- TEST 2: Fool\'s Mate (Checkmate in 2 moves) ---');
// 1. f3 e5 2. g4 Qh4#
state = createInitialState();
makeMove(state, 'f2', 'f3');
assert(state.turn === 'black', 'Black turn after f3');
makeMove(state, 'e7', 'e5');
assert(state.turn === 'white', 'White turn after e5');
makeMove(state, 'g2', 'g4');
assert(state.turn === 'black', 'Black turn after g4');
makeMove(state, 'd8', 'h4'); // Qh4#

assert(state.status === 'checkmate', 'Status is checkmate after Qh4#');
assert(state.winner === 'black', 'Winner is black');
assert(getAllLegalMoves(state, 'white').length === 0, 'White has 0 legal moves');
assert(isKingInCheck(state.board, 'white'), 'White king is in check');

console.log('\n--- TEST 3: Pin test ---');
// Create a board with pinned piece:
// White King at e1, White Rook at e2, Black Rook at e8.
// White Rook at e2 cannot move horizontally to d2 or f2 because it would expose king to check!
const pinState = createInitialState();
// Clear board
for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) pinState.board[r][c] = null;
}
pinState.board[7][4] = 'wK'; // e1
pinState.board[6][4] = 'wR'; // e2
pinState.board[0][4] = 'bR'; // e8
pinState.turn = 'white';

const pinnedRookMoves = getLegalMovesForSquare(pinState, 6, 4);
// Can move vertically (e3, e4, e5, e6, e7, e8x) but NOT horizontally (d2, f2, etc.)
assert(pinnedRookMoves.every(m => m.col === 4), 'Pinned rook can ONLY move along the pin line (col 4)');
assert(pinnedRookMoves.length > 0, 'Pinned rook can still move along pin line');

console.log('\n--- TEST 4: Castling ---');
// Set up castling for white: King e1, Rook h1, Rook a1, nothing in between
const castlingState = createInitialState();
for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) castlingState.board[r][c] = null;
}
castlingState.board[7][4] = 'wK'; // e1
castlingState.board[7][7] = 'wR'; // h1
castlingState.board[7][0] = 'wR'; // a1
castlingState.board[0][4] = 'bK'; // e8
castlingState.turn = 'white';
castlingState.castlingRights = {
    white: { kingSide: true, queenSide: true },
    black: { kingSide: true, queenSide: true }
};

const kingMoves = getLegalMovesForSquare(castlingState, 7, 4);
assert(kingMoves.some(m => coordsToAlgebraic(m.row, m.col) === 'g1' && m.isCastling === 'K'), 'Can castle Kingside (g1)');
assert(kingMoves.some(m => coordsToAlgebraic(m.row, m.col) === 'c1' && m.isCastling === 'Q'), 'Can castle Queenside (c1)');

// Now put enemy bishop attacking f1 (transit square for kingside)
castlingState.board[5][3] = 'bB'; // d3 attacks f1 (5+2, 3+2 = 7, 5)
const kingMovesUnderAttack = getLegalMovesForSquare(castlingState, 7, 4);
assert(!kingMovesUnderAttack.some(m => coordsToAlgebraic(m.row, m.col) === 'g1'), 'Cannot castle kingside through check (f1 attacked)');
assert(kingMovesUnderAttack.some(m => coordsToAlgebraic(m.row, m.col) === 'c1'), 'Queenside castle still allowed');

console.log('\n--- TEST 5: En Passant ---');
// White pawn at e5, black pawn moves d7 -> d5
const epState = createInitialState();
for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) epState.board[r][c] = null;
}
epState.board[7][4] = 'wK'; // e1
epState.board[0][4] = 'bK'; // e8
epState.board[3][4] = 'wP'; // e5
epState.board[1][3] = 'bP'; // d7
epState.turn = 'black';

makeMove(epState, 'd7', 'd5'); // moves to row 3, col 3. En passant target should be row 2, col 3 (d6).
assert(epState.enPassantTarget !== null, 'En passant target exists');
assert(coordsToAlgebraic(epState.enPassantTarget.row, epState.enPassantTarget.col) === 'd6', 'En passant target is d6');

// Now white pawn at e5 should have legal move to d6 with isEnPassant=true
const e5Moves = getLegalMovesForSquare(epState, 3, 4);
const epMove = e5Moves.find(m => coordsToAlgebraic(m.row, m.col) === 'd6');
assert(epMove && epMove.isEnPassant, 'White pawn has en passant move to d6');

// Execute en passant
makeMove(epState, 'e5', 'd6');
assert(epState.board[3][3] === null, 'Captured black pawn at d5 removed from board');
assert(epState.board[2][3] === 'wP', 'White pawn now at d6');

console.log('\n--- TEST 6: Stalemate ---');
// White King at h1, Black King at f2, Black Queen at g3 (Black turn just moved Qg3)
const staleState = createInitialState();
for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) staleState.board[r][c] = null;
}
staleState.board[7][7] = 'wK'; // h1
staleState.board[6][5] = 'bK'; // f2
staleState.board[5][6] = 'bQ'; // g3
staleState.turn = 'white';

const wMoves = getAllLegalMoves(staleState, 'white');
assert(wMoves.length === 0, 'White has no legal moves');
assert(!isKingInCheck(staleState.board, 'white'), 'White king is NOT in check');
makeMove(staleState, 'dummy', 'dummy', true); // Check state resolution
// We will verify stalemate status in full engine test

console.log('\nALL ENGINE LOGIC TESTS COMPLETED SUCCESSFULLY!');
